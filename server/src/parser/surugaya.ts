import type { ParseResult, ParsedListingCandidate } from './types';

export async function fetchSurugayaSearch(): Promise<{ listings: ParsedListingCandidate[]; responseStatus: number | null; rawLength: number; warnings: string[] }> {
  return {
    listings: [],
    responseStatus: null,
    rawLength: 0,
    warnings: ['Surugaya support is disabled.']
  };
}

export function parseSurugayaSearchHtml(): ParseResult {
  return {
    listings: [],
    diagnostics: {
      pageTitle: null,
      selectorsAttempted: [],
      selectorHits: {},
      cardsFound: 0,
      jsonLdCount: 0,
      embeddedJsonCount: 0,
      strategiesUsed: [],
      warnings: ['Surugaya parser disabled.'],
      suspectedReason: 'Surugaya parser disabled.',
      sampleTitles: []
    }
  };
}
