const WHITESPACE_RE = /\s+/g;
const PUNCTUATION_VARIANTS_RE = /[’`´]/g;
const SOFT_SEPARATOR_RE = /[|_/\\]+/g;

export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(PUNCTUATION_VARIANTS_RE, "'")
    .replace(SOFT_SEPARATOR_RE, " ")
    .replace(/[(){}[\],.:;+]+/g, " ")
    .replace(/[-]+/g, " ")
    .replace(WHITESPACE_RE, " ")
    .trim();
}

export function splitCsv(input: string): string[] {
  return input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function includesNormalizedTerm(haystack: string, needle: string): boolean {
  if (!needle.trim()) {
    return false;
  }

  return normalizeText(haystack).includes(normalizeText(needle));
}
