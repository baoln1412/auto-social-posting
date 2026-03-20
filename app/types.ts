export interface Article {
  title: string;
  url: string;
  pubDate: string;
  source: string;        // e.g. "CNN Crime"
  description: string;   // RSS description/snippet
  imageUrl?: string;     // og:image or first image from feed
  portraitUrl?: string;  // second image or face image from article
}

export interface ArticleWithSummary extends Article {
  summary: string;       // 3-4 paragraphs from NotebookLM or RSS description
}

export interface PostDraft {
  article: ArticleWithSummary;
  facebookText: string;  // full Facebook post draft (1400-2000 chars)
  emojiTitle: string;    // English title with emphasis + emoji
  emojiTitleVi: string;  // Vietnamese translation of the title
  matchTime: string;     // Match time
  matchTeams: string;    // Teams playing
  bestPlayer: string;    // Best performed player
  matchHighlight: string; // Match highlights
  generatedImageUrl?: string; // Generated image via OpenRouter
  fetchTime?: string;    // when the article was fetched (ISO timestamp)
  isNew?: boolean;       // true for posts freshly fetched in this session
  isDone?: boolean;      // true if user marked this post as done
}

