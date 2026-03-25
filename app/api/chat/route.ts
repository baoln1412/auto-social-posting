import { NextRequest } from 'next/server';
import {
  GoogleGenerativeAI,
  Tool,
  FunctionCallingMode,
  GenerativeModel,
  SchemaType,
} from '@google/generative-ai';
import { getSupabaseServer } from '@/app/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 120;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

const PRIMARY_MODEL = 'gemini-2.0-flash-lite';
const FALLBACK_MODEL = 'gemini-2.5-flash';

// ── Tool declarations ──────────────────────────────────────────────────────
const tools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'update_dashboard_filters',
        description:
          'Update the dashboard post filters based on user intent. Use this to filter posts by source, date range, or status.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            source: { type: SchemaType.STRING, description: 'Source name to filter by, or "All" for all sources' },
            from: { type: SchemaType.STRING, description: 'Start date in YYYY-MM-DD format' },
            to: { type: SchemaType.STRING, description: 'End date in YYYY-MM-DD format' },
            done: {
              type: SchemaType.STRING,
              format: 'enum',
              enum: ['all', 'not_done', 'done'],
              description: '"all" for all posts, "not_done" for drafts, "done" for published',
            },
            keyword: {
              type: SchemaType.STRING,
              description: 'Keyword to search for in post titles, content, summaries (case-insensitive)',
            },
          },
        },
      },
      {
        name: 'regenerate_draft',
        description:
          'Regenerate the Facebook post text, summary, or image prompt for a specific post article URL with custom instructions.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            articleUrl: { type: SchemaType.STRING, description: 'The article URL of the post to regenerate (use this OR postId)' },
            postId: { type: SchemaType.STRING, description: 'The post database ID (first 8 chars are shown on the card). Use this when the user references a post by ID.' },
            instructions: {
              type: SchemaType.STRING,
              description: 'Style or content instructions, e.g. "make it funnier" or "add more emojis"',
            },
            field: {
              type: SchemaType.STRING,
              format: 'enum',
              enum: ['facebook_text', 'emoji_title', 'summary'],
              description: 'Which field to regenerate',
            },
          },
          required: ['instructions', 'field'],
        },
      },
      {
        name: 'schedule_post',
        description: 'Schedule a post to be published at a specific time.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            articleUrl: { type: SchemaType.STRING, description: 'The article URL of the post to schedule' },
            scheduledAt: { type: SchemaType.STRING, description: 'ISO datetime string for when to publish' },
          },
          required: ['articleUrl', 'scheduledAt'],
        },
      },
      {
        name: 'scrape_custom_url',
        description:
          'Fetch and summarize content from a custom URL (e.g. a government site or non-RSS source). Returns a summary. Use push_to_pipeline if user confirms.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            url: { type: SchemaType.STRING, description: 'The URL to fetch and summarize' },
            instructions: {
              type: SchemaType.STRING,
              description: 'What the user wants from the page',
            },
          },
          required: ['url', 'instructions'],
        },
      },
      {
        name: 'push_to_pipeline',
        description:
          'Push previously scraped/confirmed content through the automated posting pipeline. Only call this after the user confirms.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            content: { type: SchemaType.STRING, description: 'The scraped/confirmed content to push' },
            pageId: { type: SchemaType.STRING, description: 'The content page ID to associate the posts with' },
          },
          required: ['content', 'pageId'],
        },
      },
    ],
  },
];

// ── Tool execution ─────────────────────────────────────────────────────────
async function executeTool(name: string, args: Record<string, string>): Promise<string> {
  try {
    switch (name) {
      case 'update_dashboard_filters':
        return JSON.stringify({ action: 'update_filters', ...args });

      case 'regenerate_draft': {
        const supabase = getSupabaseServer();
        // Resolve by postId prefix or full articleUrl
        let query = supabase
          .from('posts')
          .select('id, article_url, article_title, source, description, facebook_text, emoji_title, summary');
        if (args.postId) {
          // Support both full ID and 8-char prefix
          query = query.ilike('id', `${args.postId}%`);
        } else if (args.articleUrl) {
          query = query.eq('article_url', args.articleUrl);
        } else {
          return JSON.stringify({ error: 'Provide either postId or articleUrl' });
        }
        const { data: post } = await query.single();
        if (!post) return JSON.stringify({ error: 'Post not found' });

        const genModel = genAI.getGenerativeModel({ model: FALLBACK_MODEL });
        const prompt = `You are a Vietnamese social media content writer. Regenerate ONLY the "${args.field}" field.
Instructions: ${args.instructions}
Article: ${post.article_title}
Description: ${post.description ?? ''}
Existing content: ${post.facebook_text ?? post.emoji_title ?? post.summary ?? ''}
Return ONLY the regenerated value as plain text. MUST BE IN VIETNAMESE.`;
        const result = await genModel.generateContent(prompt);
        const newText = result.response.text().trim();
        const columnMap: Record<string, string> = {
          facebook_text: 'facebook_text',
          emoji_title: 'emoji_title',
          summary: 'summary',
        };
        await supabase.from('posts').update({ [columnMap[args.field]]: newText }).eq('article_url', args.articleUrl);
        return JSON.stringify({ action: 'regenerated', field: args.field, newText, articleUrl: args.articleUrl });
      }

      case 'schedule_post': {
        const supabase = getSupabaseServer();
        const { error } = await supabase
          .from('posts')
          .update({ status: 'scheduled', scheduled_at: args.scheduledAt })
          .eq('article_url', args.articleUrl);
        return error
          ? JSON.stringify({ error: error.message })
          : JSON.stringify({ action: 'scheduled', articleUrl: args.articleUrl, scheduledAt: args.scheduledAt });
      }

      case 'scrape_custom_url': {
        const resp = await fetch(args.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AutoSocialBot/1.0)' },
          signal: AbortSignal.timeout(15000),
        });
        const html = await resp.text();
        const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000);
        const genModel = genAI.getGenerativeModel({ model: FALLBACK_MODEL });
        const prompt = `User wants: "${args.instructions}"\n\nPage content from ${args.url}:\n${text}\n\nProvide a concise Vietnamese summary focused on what the user asked.`;
        const result = await genModel.generateContent(prompt);
        const summary = result.response.text().trim();
        return JSON.stringify({ action: 'scraped', url: args.url, summary });
      }

      case 'push_to_pipeline': {
        const articles = [
          {
            title: 'Nội dung từ nguồn tùy chỉnh',
            url: `custom://${Date.now()}`,
            pubDate: new Date().toISOString(),
            source: 'Custom Source',
            description: args.content,
            imageUrl: null,
          },
        ];
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
        const pipelineRes = await fetch(`${baseUrl}/api/pipeline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ articles, pageId: args.pageId }),
        });
        return pipelineRes.ok
          ? JSON.stringify({ action: 'pipeline_triggered', pageId: args.pageId })
          : JSON.stringify({ error: 'Pipeline failed to start' });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

// ── Get model with fallback ────────────────────────────────────────────────
function getModel(modelName: string): GenerativeModel {
  return genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: `You are an AI copilot embedded in a Vietnamese social media content management dashboard called "Auto Social Posting". Help the user:
- Filter and find posts (use update_dashboard_filters tool)
- Regenerate post drafts with custom instructions (use regenerate_draft tool)
- Schedule posts to channels (use schedule_post tool)
- Fetch data from custom URLs and summarize (use scrape_custom_url tool)
- Push scraped content through the pipeline after user confirms (use push_to_pipeline tool)

Always respond in the same language the user uses. Default to Vietnamese. Be concise and action-oriented.
When a tool runs successfully, acknowledge the action and ask if the user wants to do anything else.`,
    tools,
    toolConfig: { functionCallingConfig: { mode: FunctionCallingMode.AUTO } },
  });
}

// ── POST Handler ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { messages, pageId, currentFilters } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Build history from all messages except the last (current user message),
        // then drop any leading 'model' entries — Gemini requires history to start with 'user'.
        const rawHistory = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content || ' ' }], // guard against empty strings
        }));
        const firstUserIdx = rawHistory.findIndex((m: { role: string }) => m.role === 'user');
        const history = firstUserIdx >= 0 ? rawHistory.slice(firstUserIdx) : [];

        const lastMessage = messages[messages.length - 1];
        const userText = `[pageId: ${pageId}, current filters: ${JSON.stringify(currentFilters)}]\n${lastMessage.content}`;

        let model = getModel(PRIMARY_MODEL);
        let chat = model.startChat({ history });

        let response;
        try {
          response = await chat.sendMessage(userText);
        } catch (err: unknown) {
          const isQuota =
            err instanceof Error && (err.message.includes('429') || err.message.toLowerCase().includes('quota'));
          if (isQuota) {
            send({ type: 'model_fallback', message: 'Switching to gemini-2.5-flash due to quota limit...' });
            model = getModel(FALLBACK_MODEL);
            chat = model.startChat({ history });
            response = await chat.sendMessage(userText);
          } else {
            throw err;
          }
        }

        // ── Agentic tool loop ──
        let candidate = response.response;
        while (candidate.functionCalls()?.length) {
          const calls = candidate.functionCalls()!;
          const toolResults = await Promise.all(
            calls.map(async (call) => {
              const result = await executeTool(call.name, call.args as Record<string, string>);
              const parsed = JSON.parse(result);
              send({ type: 'tool_result', tool: call.name, result: parsed });
              return {
                functionResponse: {
                  name: call.name,
                  response: { content: result },
                },
              };
            }),
          );
          const nextResponse = await chat.sendMessage(toolResults);
          candidate = nextResponse.response;
        }

        send({ type: 'text', content: candidate.text() });
        send({ type: 'done' });
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
