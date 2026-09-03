/**
 * Rejects a non-finite number at the boundary, naming the parameter.
 *
 * A single NaN entering the geometry engine propagates silently: the canvas
 * goes blank, the file saves, and the file will not reopen. Catching it where
 * it enters turns a mystery into a message.
 *
 * Returns the value so it can be used inline.
 */
export function assertFinite(value: number, name: string): number {
  if (Number.isFinite(value)) return value;

  const received = Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity';
  throw new RangeError(`${name} must be a finite number, received ${received}`);
}

/**
 * Asserts a condition that the type system cannot express, narrowing the type
 * for the compiler when it holds.
 *
 * For programmer errors — a broken internal invariant — not for anything a
 * user can cause. User-facing failures belong in a Result or a Diagnostic,
 * where they can be shown rather than thrown.
 */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
