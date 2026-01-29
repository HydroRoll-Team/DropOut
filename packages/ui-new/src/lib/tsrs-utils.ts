export type Maybe<T> = T | null | undefined;

export function toNumber(
  value: Maybe<number | bigint | string>,
  fallback = 0,
): number {
  if (value === null || value === undefined) return fallback;

  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    return fallback;
  }

  if (typeof value === "bigint") {
    // safe conversion for typical values (timestamps, sizes). Might overflow for huge bigint.
    return Number(value);
  }

  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  return fallback;
}

/**
 * Like `toNumber` but ensures non-negative result (clamps at 0).
 */
export function toNonNegativeNumber(
  value: Maybe<number | bigint | string>,
  fallback = 0,
): number {
  const n = toNumber(value, fallback);
  return n < 0 ? 0 : n;
}

export function toDate(
  value: Maybe<number | bigint | string>,
  opts?: { isSeconds?: boolean },
): Date | null {
  if (value === null || value === undefined) return null;

  const isSeconds = opts?.isSeconds ?? true;

  // accept bigint, number, numeric string
  const n = toNumber(value, NaN);
  if (Number.isNaN(n)) return null;

  const ms = isSeconds ? Math.floor(n) * 1000 : Math.floor(n);
  return new Date(ms);
}

/**
 * Convert a binding boolean-ish value (0/1, "true"/"false", boolean) to boolean.
 */
export function toBoolean(value: unknown, fallback = false): boolean {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const s = value.toLowerCase().trim();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
  }
  return fallback;
}
