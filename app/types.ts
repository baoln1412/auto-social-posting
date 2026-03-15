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
  nb2Prompt: string;     // Nano Banana 2 image generation prompt
  emojiTitle: string;    // English title with emphasis + emoji
  emojiTitleVi: string;  // Vietnamese translation of the title
  commentBait: string;   // comprehensive comment — more detailed than the post, with source
  state: string;         // US state where the crime occurred
}

