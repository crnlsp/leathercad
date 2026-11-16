import { IDENTITY, compose, MatOps, type Mat2x3 } from '@leathercad/geometry';
import { numbers, SvgImportError } from './numbers.js';

export function readTransform(text: string): Mat2x3 {
  let rest = text.trim(),
    result = IDENTITY;
  while (rest) {
    const match = /^([a-zA-Z]+)\s*\(([^()]*)\)\s*,?\s*/.exec(rest);
    if (!match) throw new SvgImportError('INVALID_SVG');
    const [, name, args = ''] = match,
      values = numbers(args);
    const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = values;
    let matrix: Mat2x3;
    switch (name) {
      case 'matrix':
        if (values.length !== 6) throw new SvgImportError('INVALID_SVG');
        matrix = { a, b, c, d, e, f };
        break;
      case 'translate':
        if (values.length < 1 || values.length > 2) throw new SvgImportError('INVALID_SVG');
        matrix = MatOps.fromTranslation({ x: a, y: b });
        break;
      case 'scale':
        if (values.length < 1 || values.length > 2) throw new SvgImportError('INVALID_SVG');
        matrix = MatOps.fromScale(a, values[1] ?? a);
        break;
      case 'rotate':
        if (values.length !== 1 && values.length !== 3) throw new SvgImportError('INVALID_SVG');
        matrix = MatOps.fromRotationAround({ x: b, y: c }, (a * Math.PI) / 180);
        break;
      case 'skewX':
      case 'skewY':
        if (values.length !== 1) throw new SvgImportError('INVALID_SVG');
        matrix = {
          ...IDENTITY,
          c: name === 'skewX' ? Math.tan((a * Math.PI) / 180) : 0,
          b: name === 'skewY' ? Math.tan((a * Math.PI) / 180) : 0,
        };
        break;
      default:
        throw new SvgImportError('INVALID_SVG');
    }
    result = compose(matrix, result);
    rest = rest.slice(match[0].length);
  }
  return result;
}
