import type { ParsedListingCandidate } from './types';

// Poshmark support is intentionally disabled. Keep a stub parser so old imports remain harmless.
export function parsePoshmarkHtml(_html: string, _baseUrl: string): ParsedListingCandidate[] {
  return [];
}
