const DURATION_PATTERN = /^(\d+)(ms|s|m|h|d)$/i;

const MULTIPLIERS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseDuration(value: string): number {
  const normalized = value.trim();
  const match = DURATION_PATTERN.exec(normalized);

  if (!match) {
    throw new Error(`Invalid duration: ${value}. Expected formats like 15m, 2h, or 30d.`);
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const milliseconds = amount * MULTIPLIERS[unit];

  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
    throw new Error(`Duration is outside the supported range: ${value}`);
  }

  return milliseconds;
}
