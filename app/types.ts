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

export interface PostDraft {
  article: ArticleWithSummary;
  facebookText: string;
  emojiTitle: string;
  generatedImageUrl?: string;
  fetchTime?: string;
  isNew?: boolean;
  isDone?: boolean;
  pageId?: string;
}

export interface ContentPage {
  id: string;
  name: string;
  systemPrompt: string;
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
