# AI Chat Assistant Integration

## 1. Overview
The goal is to build a collapsible AI chat window integrated directly into the dashboard, powered by the Gemini 3.1 Flash model. This assistant will act as a "copilot" for the automated social media pipeline, allowing the user to:
1. Filter posts dynamically (by countries, types, etc.) using natural language.
2. Regenerate content (post drafts, image prompts, platform prompts, system/user prompts) on the fly.
3. Post or schedule content to specific channels directly from the chat.
4. Fetch and synthesize custom data from non-standard sites (e.g., governance or official non-RSS feeds) based on user instructions.

## 2. Project Type
**WEB** (Next.js, React Frontend, API routes for backend execution, Supabase for state/history).

## 3. Success Criteria
- [ ] A collapsible, persistent chat UI is available on all relevant dashboard pages.
- [ ] The AI can execute tools/functions (function calling) to trigger local filtering, DB updates, and Supabase scheduling.
- [ ] Filtering via AI directly manipulates the dashboard UI filters without conflicting with the existing manual filter logic.
- [ ] The AI successfully scrapes custom URLs, presents the data in chat, and waits for confirmation before pushing it through the auto-posting pipeline.
- [ ] The chat uses `gemini-3.1-flash-lite-preview` as the primary model, with an automatic fallback to `gemini-2.5-flash` if quota limits are hit.

## 4. Tech Stack & Architecture
- **Frontend Model:** Gemini SDK / Vercel AI SDK.
- **Model Fallback Logic:** Wrap the model call in a try/catch. If `429 Quota Exceeded` is caught on `gemini-3.1-flash-lite-preview`, automatically retry with `gemini-2.5-flash`.
- **Tooling (Function Calling):** 
  - `update_dashboard_filters(criteria)`: Updates React state/URL params to filter posts (Countries, Types, etc.) cooperatively with existing manual filters.
  - `regenerate_draft(postId, instructions)`: Re-runs the generation logic for a specific post.
  - `schedule_post(postId, channels, time)`: Updates the `posts` table with scheduling data.
  - `scrape_custom_url(url, instructions)`: Fetches a given URL and summarizes the data in the chat.
  - `push_to_pipeline(scrapedData)`: Sends the previously scraped/confirmed data through the standard content generation pipeline and saves to Supabase.
- **State Management:** Vercel AI SDK `useChat` hook for chat history. Context API / Zustand or URL SearchParams for dashboard filter sync.

## 5. File Structure (Proposed)
```
app/
├── components/
│   └── chat/
│       ├── AIChatWindow.tsx       # Main collapsible UI shell
│       ├── ChatMessage.tsx        # Individual message rendering
│       └── ChatInput.tsx          # Input field with send/attach behavior
├── api/
│   └── chat/
│       └── route.ts               # Core API route handling streaming and function calls
└── lib/
    └── tools/                     # Tool definitions for Gemini function calling
        ├── filterTools.ts
        ├── generationTools.ts
        ├── schedulingTools.ts
        └── scrapingTools.ts
```

## 6. Task Breakdown

### Task 1: Foundation - API & Streaming Chat Setup
- **Agent:** `backend-specialist`
- **Skill:** `api-patterns`
- **Input:** API keys and Model Selection.
- **Output:** `/api/chat/route.ts` with Vercel AI SDK stream, implementing the `gemini-3.1-flash-lite-preview` -> `gemini-2.5-flash` fallback logic.
- **Verify:** Sending a message "Hello" returns a streamed AI response.

### Task 2: UI - Collapsible Chat Component & Filter Sync
- **Agent:** `frontend-specialist`
- **Skill:** `frontend-design`, `react-best-practices`
- **Input:** Standard dashboard layout framework and Filter state.
- **Output:** A floating action button (FAB) that opens a glassmorphic chat pane. Integration of `update_dashboard_filters` tool to safely update the UI's filter state (via URL params or Context) without overriding manual selections unexpectedly.
- **Verify:** Chat opens/closes smoothly. Asking "Show me only posts about Visas" updates the UI list directly.

### Task 3: Tool Implementation - Regeneration & Scheduling
- **Agent:** `backend-specialist` / `frontend-specialist`
- **Skill:** `api-patterns`
- **Input:** Existing Supabase tables and state management.
- **Output:** Implementation of `regenerate_draft` and `schedule_post` tools.
- **Verify:** Asking "Make the Facebook text for Post X funnier" triggers a targeted regeneration. Asking to schedule a post works securely.

### Task 4: Tool Implementation - Custom Scraping & Pipeline Trigger
- **Agent:** `backend-specialist`
- **Skill:** `bash-linux`, `nodejs-best-practices`
- **Input:** Target URLs and pipeline logic.
- **Output:** Implementation of `scrape_custom_url` (returns summary to chat) and `push_to_pipeline` (triggers `/api/pipeline` equivalent generation and DB save).
- **Verify:** Asking to "Get updates from [Gov URL]" returns parsed data in the chat. Saying "Looks good, generate posts for this" successfully inserts them into the dashboard.

## 7. Phase X: Verification Checklist
- [ ] No purple/violet hex codes used in UI.
- [ ] Chat window is fully responsive (mobile-friendly).
- [ ] Chat history is managed efficiently (no memory leaks).
- [ ] Function calling tools gracefully handle errors (e.g., 429 rate limits, scraping blockers).
- [ ] Model fallback accurately engages when `3.1-flash-lite-preview` quota is exhausted.
