#!/usr/bin/env node
/**
 * PERF-012: bounded reproductions of excessive hole, tile and ZIP requests.
 * node --expose-gc tools/perf-resources.mjs [--root <before-tree>]
 *
 * Bundles that tree's production functions with Vite, as perf-compute.mjs does.
 * Three fresh samples per request; no enormous geometry or unbounded ZIP bomb.
 * The ZIP claims 64 MiB but contains an ordinary empty document. The old loader
 * allocates that claim; the bounded loader refuses it before expansion.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const root = resolve(args[0] === '--root' ? args[1] : resolve(import.meta.dirname, '..'));
const src = (file) => JSON.stringify(resolve(root, file));
const entry = `
import { distributeHoles } from ${src('packages/domain/src/stitch.ts')};
import { DEFAULT_SETTINGS } from ${src('packages/domain/src/feature.ts')};
import { evaluate } from ${src('packages/domain/src/evaluate.ts')};
import { buildExportScene, planSheets, pageSetupFor, exportPdf, exportSvg, exportDxf } from ${src('packages/export/src/index.ts')};
import { Shapes } from ${src('packages/geometry/src/index.ts')};
import { paginate } from ${src('packages/export/src/paginate.ts')};
import { DEFAULT_PAGE_SETUP } from ${src('packages/export/src/paper.ts')};
import { loadProject, saveProject } from ${src('packages/persist/src/index.ts')};
export async function normal(bytes) {
  const {project,manifest} = loadProject(bytes);
  const scene = buildExportScene(evaluate(project), project.name);
  const plan = planSheets(scene, pageSetupFor(project.settings));
  const now = () => new Date('2026-01-01T00:00:00Z');
  return {
    pages:plan.sheets.length,
    lcp:saveProject(project,{applicationVersion:'test',createdUtc:manifest.createdUtc,now}),
    pdf:(await exportPdf(plan,{applicationVersion:'test',now})).bytes,
    svg:exportSvg(scene).text,
    dxf:exportDxf(scene).text,
  };
}
export function holes() {
  const result = distributeHoles(Shapes.roundedRect({x:0,y:0}, 32000,32000,0), {
    pitchMm:0.5,mode:'fit-whole',corners:'hole-at-corner'
  });
  return { allocatedHoles: result.count };
}
export function tiles() {
  const part = {id:'strap',name:'Strap',quantity:1,boundsMm:{minX:0,minY:0,maxX:200000,maxY:20},paths:[],texts:[]};
  return { allocatedPages: paginate({projectName:'Test',parts:[part]}, DEFAULT_PAGE_SETUP).pages.length };
}
export function archive() {
  const bytes = saveProject({id:'p',name:'',settings:DEFAULT_SETTINGS,parts:[]}, {
    applicationVersion:'1.5.0',now:()=>new Date('2026-01-01T00:00:00Z')
  });
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const decoder = new TextDecoder();
  for(let i=0;i<=bytes.length-46;i++) {
    if(view.getUint32(i,true)===0x02014b50) {
      const length=view.getUint16(i+28,true);
      if(decoder.decode(bytes.subarray(i+46,i+46+length))==='document.json') {
        view.setUint32(i+24,64*1024*1024,true);break;
      }
    }
  }
  return () => { loadProject(bytes); return { loaded:true }; };
}
`;
const directory = mkdtempSync(join(tmpdir(), 'lc-resources-'));
try {
  const input = join(directory, 'entry.js');
  writeFileSync(input, entry);
  const desktop = resolve(import.meta.dirname, '../apps/desktop/package.json');
  const vite = await import(pathToFileURL(createRequire(desktop).resolve('vite')).href);
  const build = await vite.build({
    configFile: false,
    logLevel: 'silent',
    root: directory,
    build: {
      write: false,
      target: 'esnext',
      lib: { entry: input, formats: ['es'], fileName: 'resources' },
    },
  });
  const output = join(directory, 'resources.mjs');
  writeFileSync(output, [build].flat()[0].output[0].code);
  const library = await import(pathToFileURL(output).href);
  const result = {};
  for (const name of ['holes', 'tiles', 'archive']) {
    const samples = [];
    let outcome;
    for (let run = 0; run < 3; run++) {
      const invoke = name === 'archive' ? library.archive() : library[name];
      globalThis.gc?.();
      const start = performance.now();
      try {
        outcome = { status: 'completed', ...invoke() };
      } catch (error) {
        outcome = {
          status: 'refused',
          error: error.name,
          ...(error.resource === undefined
            ? {}
            : { resource: error.resource, requested: error.requested, limit: error.limit }),
        };
      }
      samples.push(Number((performance.now() - start).toFixed(3)));
    }
    result[name] = { ...outcome, milliseconds: samples };
  }
  const identical = {};
  for (const fixture of [
    'projects/bifold-wallet.lcp',
    'projects/print-test.lcp',
    'perf/strap-5800.lcp',
    'perf/traced-500.lcp',
  ]) {
    const { pages, ...files } = await library.normal(
      new Uint8Array(readFileSync(resolve(root, 'fixtures', fixture))),
    );
    identical[fixture] = {
      pages,
      ...Object.fromEntries(
        Object.entries(files).map(([format, bytes]) => [
          format,
          createHash('sha256').update(bytes).digest('hex'),
        ]),
      ),
    };
  }
  result.acceptedOutput = identical;
  console.log(
    JSON.stringify(
      {
        commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
          cwd: root,
          encoding: 'utf8',
        }).trim(),
        node: process.version,
        workingTree:
          execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() ===
          ''
            ? 'clean'
            : 'modified',
        ...result,
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
