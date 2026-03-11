import type { ParsedListingCandidate } from './types';

export async function fetchDepopSearch(): Promise<{ listings: ParsedListingCandidate[]; responseStatus: number | null; rawLength: number; warnings: string[] }> {
  return {
    listings: [],
    responseStatus: null,
    rawLength: 0,
    warnings: ['Depop support is disabled.']
  };
}
