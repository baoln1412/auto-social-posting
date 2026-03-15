## 1. RSS Feed Expansion

- [x] 1.1 Update `FEEDS` array in `app/api/fetch-news/route.ts` to include 20+ sources with crime-specific RSS endpoints (add Oxygen, People Crime, expand CNN/NBC/CBS/Fox to crime endpoints)
- [x] 1.2 Add `crimeSpecific: boolean` flag to each feed entry to distinguish specialist crime feeds from general news feeds
- [x] 1.3 Verify all new RSS feed URLs are reachable and return valid XML (test with `rss-parser`)

## 2. Crime Keyword Filtering

- [x] 2.1 Create a `CRIME_KEYWORDS` constant array with crime-related terms (murder, kill, arrest, charged, suspect, shooting, stabbing, assault, robbery, kidnap, missing, court, trial, verdict, homicide, manslaughter, arson, fentanyl, overdose, indicted, convicted, sentenced)
- [x] 2.2 Implement `isCrimeArticle(article, isCrimeSpecificFeed)` filter function that checks title + description against keywords, auto-passing crime-specific feed articles
- [x] 2.3 Apply filter in `GET()` handler after deduplication, before sorting
- [x] 2.4 Increase `MAX_ARTICLES` from 10 to 25 and `MIN_ARTICLES` from 5 to 20

## 3. NotebookLM MCP Integration

- [x] 3.1 Install `notebooklm-mcp-server` SDK/client as a project dependency (or use the MCP tools via the existing server process)
- [x] 3.2 Create `app/api/pipeline/notebooklm-client.ts` — utility module wrapping NotebookLM MCP calls: `createNotebook()`, `addUrlSource()`, `querySummary()`, `deleteNotebook()`
- [x] 3.3 Implement batch summarization flow: create one notebook per pipeline run → add all article URLs → query for per-article summaries → delete notebook
- [x] 3.4 Add error handling for URL ingestion failures (paywall/404) — fall back to RSS description
- [x] 3.5 Add error handling for MCP unavailability — fall back to RSS descriptions with clear console warning

## 4. Facebook Content Engine

- [x] 4.1 Rewrite `processArticle()` in `article-processor.ts` to use NotebookLM query instead of `claude -p` subprocess for content generation
- [x] 4.2 Construct the style-spec prompt matching the exact editorial format (4-paragraph body, emoji title ≤16 words, CTA, 3-paragraph comment bait)
- [x] 4.3 Parse NotebookLM query response into structured `PostDraft` fields (emojiTitle, facebookText, commentBait)
- [x] 4.4 Update `buildFallbackPost()` to match the new editorial spec when AI generation fails
- [x] 4.5 Remove `claude -p` subprocess code from `article-processor.ts` and `notebooklm.ts`
- [x] 4.6 Remove or consolidate `app/api/summarize/` and `app/api/format-posts/` routes (functionality merged into the pipeline)

## 5. NB2 Image Prompt Generator

- [x] 5.1 Update `buildNb2Prompt()` to generate the full structured prompt matching design spec: 4:5 ratio, darkened background 40%, circular portrait (bottom-left, 30% width, #f0e523 border), eye-censor black rectangle, Source Sans Variable Black font, yellow-highlighted key words, drop shadow
- [x] 5.2 Add logic to identify the "most dramatic keyword" in the emojiTitle for yellow highlighting in the NB2 prompt
- [x] 5.3 Handle missing imageUrl/portraitUrl gracefully with generic descriptions

## 6. UI Updates

- [x] 6.1 Update `PostCard.tsx` — improve visual hierarchy of NB2 prompt, Facebook draft, and comment bait sections
- [x] 6.2 Update `page.tsx` — adjust grid layout for potentially 20+ post cards (consider pagination or "load more")
- [x] 6.3 Add article source link in PostCard for reference back to original article

## 7. Cleanup & Verification

- [x] 7.1 Remove unused `claude -p` subprocess code and related imports
- [x] 7.2 Ensure `package.json` has no unused dependencies
- [x] 7.3 Run `npm run build` to verify no TypeScript errors
- [x] 7.4 Manual end-to-end test: click "Fetch Today's Crime News" → verify 20+ articles appear → verify Facebook drafts, comment bait, and NB2 prompts are properly formatted
