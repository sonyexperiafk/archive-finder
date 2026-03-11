import type { AgeConfidence, FeedSource, SellerType, Vertical } from '@avito-monitor/shared';

export interface ParsedListingCandidate {
  source: FeedSource;
  externalId: string | null;
  title: string;
  description?: string | null;
  category?: string | null;
  vertical?: Vertical;
  priceText: string | null;
  priceValueOptional: number | null;
  currencyTextOptional: string | null;
  priceOriginal?: number | null;
  currencyOriginal?: string | null;
  priceUsd?: number | null;
  url: string;
  canonicalUrl: string;
  locationText: string | null;
  sellerType: SellerType;
  imageUrl1: string | null;
  imageUrl2: string | null;
  publishedTextOptional: string | null;
  postedAt?: string | null;
  ageMinutesOptional?: number | null;
  ageConfidence?: AgeConfidence;
  unknownAgeOptional?: boolean;
  brandDetected?: string | null;
  raw: Record<string, unknown>;
}

export interface ParseDiagnostics {
  pageTitle: string | null;
  selectorsAttempted: string[];
  selectorHits: Record<string, number>;
  cardsFound: number;
  jsonLdCount: number;
  embeddedJsonCount: number;
  strategiesUsed: string[];
  warnings: string[];
  suspectedReason: string | null;
  sampleTitles: string[];
}

export interface ParseResult {
  listings: ParsedListingCandidate[];
  diagnostics: ParseDiagnostics;
}
