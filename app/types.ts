export interface Article {
  title: string;
  url: string;
  pubDate: string;
  source: string;
  description: string;
  imageUrl?: string;
  /** All images found in the article (imageUrls[0] === imageUrl). Used for the
   *  news-card background + circle inset. */
  imageUrls?: string[];
  portraitUrl?: string;
  /** US state or city detected from the article text, e.g. 'Georgia' */
  location?: string;
}

export interface ArticleWithSummary extends Article {
  summary: string;
}

export type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed';

export interface PostDraft {
  id?: string;
  article: ArticleWithSummary;
  facebookText: string;
  emojiTitle: string;
  /** SOP part 7 — 3–6 hashtags (Vietnamese + a few English), space-separated */
  hashtags?: string;
  /** SOP part 1 — single-line opening hook */
  hook?: string;
  /** Seed comment 1 — posted as the first comment to spark engagement */
  comment1?: string;
  /** Seed comment 2 — importance + follow-page call-to-action */
  comment2?: string;
  /** SOP §5 — English visual concept, used to AI-generate a card background
   *  when the article has no image (Case 2). */
  imagePrompt?: string;
  /** Topic ids (subset of TOPIC_IDS) this post is tagged with — for filter chips. */
  topics?: string[];
  generatedImageUrl?: string;
  platformDrafts?: Record<string, string>;
  fetchTime?: string;
  isNew?: boolean;
  isDone?: boolean;
  pageId?: string;
  status?: PostStatus;
  scheduledAt?: string;
  publishedAt?: string;
  engagement?: { likes: number; comments: number; shares: number };
}

export interface KeywordConfig {
  tier1: string[];
  tier2: string[];
  minScore: number;
  /** Enable crime/exclude/political hard-filters at the fetch stage */
  useCrimeFilter?: boolean;
  /** Articles must match at least one of these to pass (unless feed is crimeSpecific) */
  crimeKeywords?: string[];
  /** Articles matching any of these are always excluded */
  excludeKeywords?: string[];
  /** Articles matching any of these are always excluded */
  politicalKeywords?: string[];
}

export interface ContentPage {
  id: string;
  name: string;
  /** ISO 3166-1 alpha-2 country code for the market, e.g. 'US', 'AU' */
  countryCode: string;
  /** Official country name, e.g. 'United States of America' */
  countryName: string;
  /** Output language code for generated content, e.g. 'en', 'vi' */
  language: string;
  systemPrompt: string;
  userPrompt: string;
  platformPrompts: Record<string, string>;
  keywordConfig: KeywordConfig;
  /** Per-market term mappings (source term → preferred term) */
  glossary: Record<string, string>;
  /** Free-text wording rules for the market */
  wordingRules: string;
  /** Free-text writing-style guidance for the market */
  writingStyle: string;
  /** Subset of the 12-topic taxonomy (TOPIC_IDS) this market generates. */
  enabledTopics: string[];
  lastFetchTime?: string;
  createdAt: string;
  updatedAt: string;
}

/** A market is a content page in this tool. Alias for clarity. */
export type Market = ContentPage;

export interface PageChannel {
  id: string;
  pageId: string;
  platform: 'facebook' | 'tiktok' | 'threads' | 'instagram';
  platformPageId: string;
  platformPageName: string;
  accessToken: string;
  connectedAt: string;
}

export interface FeedEntry {
  id: string;
  pageId: string;
  name: string;
  url: string;
  feedType: 'rss' | 'atom' | 'web_scrape';
  scrapeSelector?: string;
  enabled: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  totalCount: number;
  limit: number;
  offset: number;
}
