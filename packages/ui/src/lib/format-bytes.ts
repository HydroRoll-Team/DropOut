const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;
const UNIT_SIZE = 1024n;

export function formatBytes(value: bigint) {
  if (value <= 0n) return "0 B";

  let unit = 0;
  let divisor = 1n;
  while (unit < BYTE_UNITS.length - 1 && value >= divisor * UNIT_SIZE) {
    unit += 1;
    divisor *= UNIT_SIZE;
  }

  if (unit <= 1) {
    const rounded = (value + divisor / 2n) / divisor;
    return `${rounded} ${BYTE_UNITS[unit]}`;
  }

  const roundedTenths = (value * 10n + divisor / 2n) / divisor;
  const whole = roundedTenths / 10n;
  const fraction = roundedTenths % 10n;
  return `${whole}.${fraction} ${BYTE_UNITS[unit]}`;
}
