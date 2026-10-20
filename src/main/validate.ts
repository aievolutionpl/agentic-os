export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("INVALID_INPUT");
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 240, empty = false): string {
  if (
    typeof value !== "string" ||
    value.includes("\0") ||
    value.length > max ||
    (!empty && !value.trim())
  )
    throw Error("INVALID_INPUT");
  return value.trim();
}
export function exact(value: unknown, fields: string[]) {
  const p = object(value);
  if (Object.keys(p).some((key) => !fields.includes(key)))
    throw Error("INVALID_INPUT");
  return p;
}
/** Redacted text cut to `max` keeping both ends: a reply's closing block (a
 * reviewer's verdict and findings) survives a long body. */
export function redactEnds(value: string, max = 8000): string {
  const clean = redact(value, Infinity);
  if (clean.length <= max) return clean;
  const marker = "\n[…]\n",
    head = Math.floor((max - marker.length) / 4);
  return (
    clean.slice(0, head) + marker + clean.slice(-(max - marker.length - head))
  );
}
export function redact(value: string, max = 4000): string {
  return value
    .replace(
      /\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]+)/g,
      "[REDACTED]",
    )
    .replace(
      /(authorization\s*[:=]\s*(?:bearer\s+)?|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password)\s*["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,
      "$1[REDACTED]",
    )
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, "$1[REDACTED]@")
    .slice(0, max);
}
