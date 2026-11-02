export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * An explicit success-or-failure value, for failures a user can cause and
 * should see: an offset that collapsed, a file that would not parse.
 *
 * Programmer errors still throw — see `invariant`. The distinction matters:
 * a thrown error is a bug to fix, a Result is a state to render.
 */
export type Result<T, E = string> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Throws on failure. Only for cases where failure really is impossible. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw new Error(`unwrap called on a failed Result: ${String(result.error)}`);
}
