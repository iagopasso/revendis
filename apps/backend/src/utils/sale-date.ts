const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIDNIGHT_TIMESTAMP_REGEX = /^(\d{4})-(\d{2})-(\d{2})T00:00(?::00(?:\.\d{1,6})?)?$/i;

const buildUtcNoonDate = (year: number, month: number, day: number) => {
  const normalized = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() !== month - 1 ||
    normalized.getUTCDate() !== day
  ) {
    return null;
  }
  return normalized;
};

export const parseSaleCreatedAt = (value?: string | null) => {
  const fallback = new Date();
  if (!value) return fallback;
  const input = value.trim();
  if (!input) return fallback;

  const dateOnlyMatch = input.match(DATE_ONLY_REGEX);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    return buildUtcNoonDate(year, month, day) || fallback;
  }

  const midnightTimestampMatch = input.match(MIDNIGHT_TIMESTAMP_REGEX);
  if (midnightTimestampMatch) {
    const year = Number(midnightTimestampMatch[1]);
    const month = Number(midnightTimestampMatch[2]);
    const day = Number(midnightTimestampMatch[3]);
    return buildUtcNoonDate(year, month, day) || fallback;
  }

  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};
