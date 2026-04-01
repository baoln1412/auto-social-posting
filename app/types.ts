export interface Article {
  title: string;
  url: string;
  pubDate: string;
  source: string;
  description: string;
  imageUrl?: string;
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
  emojiTitleVi?: string;
  matchTime?: string;
  matchTeams?: string;
  bestPlayer?: string;
  matchHighlight?: string;
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
  /** Per-channel overrides — null means use parent ContentPage config */
  systemPrompt?: string | null;
  userPrompt?: string | null;
  keywordConfig?: KeywordConfig | null;
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
