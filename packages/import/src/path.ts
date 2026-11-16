import { approxEq, EPS_POINT } from '@leathercad/core';
import {
  EXPORT_TOLERANCE_MM,
  line,
  cubic,
  quadraticToCubic,
  path,
  type Path,
  type Segment,
  type Vec2,
} from '@leathercad/geometry';
import { Numbers, SvgImportError } from './numbers.js';
import { svgArc } from './arc.js';

export function readPath(text: string, tolerance = EXPORT_TOLERANCE_MM): Path[] {
  const n = new Numbers(text),
    result: Path[] = [];
  let current: Vec2 = { x: 0, y: 0 },
    start = current;
  let segments: Segment[] = [],
    command = '',
    previous = '';
  let control = current;
  const flush = (closed = false): void => {
    if (segments.length) result.push(path(segments, closed));
    segments = [];
  };
  while (!n.done) {
    if (n.command) command = n.letter();
    else if (!command) throw new SvgImportError('INVALID_SVG');
    const op = command.toUpperCase(),
      relative = command !== op;
    const origin = current;
    const point = (): Vec2 => ({
      x: n.number() + (relative ? origin.x : 0),
      y: n.number() + (relative ? origin.y : 0),
    });
    const reflected = (): Vec2 => ({ x: 2 * current.x - control.x, y: 2 * current.y - control.y });
    let end: Vec2;
    switch (op) {
      case 'M':
        flush();
        current = point();
        start = current;
        command = relative ? 'l' : 'L';
        break;
      case 'Z':
        if (segments.length) {
          if (!approxEq(current.x, start.x, EPS_POINT) || !approxEq(current.y, start.y, EPS_POINT))
            segments.push(line(current, start));
          flush(true);
        }
        current = start;
        command = '';
        break;
      case 'L':
        end = point();
        segments.push(line(current, end));
        current = end;
        break;
      case 'H':
        end = { x: n.number() + (relative ? current.x : 0), y: current.y };
        segments.push(line(current, end));
        current = end;
        break;
      case 'V':
        end = { x: current.x, y: n.number() + (relative ? current.y : 0) };
        segments.push(line(current, end));
        current = end;
        break;
      case 'C':
      case 'S': {
        const first = op === 'C' ? point() : /[CS]/.test(previous) ? reflected() : current;
        const second = point();
        end = point();
        segments.push(cubic(current, first, second, end));
        control = second;
        current = end;
        break;
      }
      case 'Q':
      case 'T': {
        const first = op === 'Q' ? point() : /[QT]/.test(previous) ? reflected() : current;
        end = point();
        segments.push(quadraticToCubic(current, first, end));
        control = first;
        current = end;
        break;
      }
      case 'A': {
        const rx = n.number(),
          ry = n.number(),
          rotation = n.number(),
          large = n.number(true),
          sweep = n.number(true);
        end = point();
        segments.push(...svgArc(current, end, rx, ry, rotation, large, sweep, tolerance));
        current = end;
        break;
      }
      default:
        throw new SvgImportError('INVALID_SVG');
    }
    if (!previous && op !== 'M') throw new SvgImportError('INVALID_SVG');
    previous = op;
  }
  flush();
  return result;
}
