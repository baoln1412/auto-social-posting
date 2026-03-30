export interface Article {
  title: string;
  url: string;
  pubDate: string;
  source: string;
  description: string;
  imageUrl?: string;
  portraitUrl?: string;
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
  systemPrompt: string;
  userPrompt: string;
  platformPrompts: Record<string, string>;
  keywordConfig: KeywordConfig;
  lastFetchTime?: string;
  createdAt: string;
  updatedAt: string;
}

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
