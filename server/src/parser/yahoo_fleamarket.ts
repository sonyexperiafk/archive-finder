import type { ParsedListingCandidate } from './types';

// Yahoo! Flea support is intentionally disabled. Keep a stub parser so old imports remain harmless.
export function parseYahooFleamarketHtml(_html: string, _baseUrl: string): ParsedListingCandidate[] {
  return [];
}
