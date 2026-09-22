export type BlockTier = 'strong' | 'weak';

export interface BlockPhraseMatch {
  phrase: string;
  tier: BlockTier;
}

const STRONG_PHRASES = [
  'unavailable in your country',
  'unavailable in your location',
  'unavailable in your region',
  'not available in your country',
  'not available in your location',
  'not available in your region',
  'not supported in your country',
  'not supported in your region',
  'not offered in your country',
  'due to sanctions',
  'restricted in your country',
  'restricted in your region',
];

const WEAK_PHRASES = ['access denied', 'region restricted', 'not available in your area'];

const ALL_PHRASES: BlockPhraseMatch[] = [
  ...STRONG_PHRASES.map((phrase) => ({ phrase, tier: 'strong' as const })),
  ...WEAK_PHRASES.map((phrase) => ({ phrase, tier: 'weak' as const })),
];

export function findBlockPhrase(pageText: string): BlockPhraseMatch | undefined {
  const normalized = pageText.toLowerCase().replace(/\s+/g, ' ');
  return ALL_PHRASES.find((candidate) => normalized.includes(candidate.phrase));
}
