import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { getSupabaseServer } from '@/app/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 120;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? '';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://github.com/baoln1412/auto-social-posting', 
    'X-Title': 'Auto Social Posting',
  }
});

const DEFAULT_MODEL = 'stepfun/step-3.5-flash:free';

// ── Tool declarations (OpenAI spec) ───────────────────────────────────────
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'update_dashboard_filters',
      description: 'Update the dashboard post filters based on user intent. Use this to filter posts by source, date range, or status.',
      parameters: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Source name to filter by, or "All" for all sources' },
          from: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
          to: { type: 'string', description: 'End date in YYYY-MM-DD format' },
          done: {
            type: 'string',
            enum: ['all', 'not_done', 'done'],
            description: '"all" for all posts, "not_done" for drafts, "done" for published',
          },
          keyword: {
            type: 'string',
            description: 'Keyword to search for in post titles, content, summaries (case-insensitive)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'regenerate_draft',
      description: 'Regenerate the Facebook post text, summary, or image prompt for a specific post article URL with custom instructions.',
      parameters: {
        type: 'object',
        properties: {
          articleUrl: { type: 'string', description: 'The article URL of the post to regenerate (use this OR postId)' },
          postId: { type: 'string', description: 'The post database ID (first 8 chars are shown on the card). Use this when the user references a post by ID.' },
          instructions: {
            type: 'string',
            description: 'Style or content instructions, e.g. "make it funnier" or "add more emojis"',
          },
          field: {
            type: 'string',
            enum: ['facebook_text', 'emoji_title', 'summary'],
            description: 'Which field to regenerate',
          },
        },
        required: ['instructions', 'field'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'schedule_post',
      description: 'Schedule a post to be published at a specific time.',
      parameters: {
        type: 'object',
        properties: {
          articleUrl: { type: 'string', description: 'The article URL of the post to schedule' },
          scheduledAt: { type: 'string', description: 'ISO datetime string for when to publish' },
        },
        required: ['articleUrl', 'scheduledAt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scrape_custom_url',
      description: 'Fetch and summarize content from a custom URL (e.g. a government site or non-RSS source). Returns a summary. Use push_to_pipeline if user confirms.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch and summarize' },
          instructions: {
            type: 'string',
            description: 'What the user wants from the page',
          },
        },
        required: ['url', 'instructions'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'push_to_pipeline',
      description: 'Push previously scraped/confirmed content through the automated posting pipeline. Only call this after the user confirms.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The scraped/confirmed content to push' },
          pageId: { type: 'string', description: 'The content page ID to associate the posts with' },
        },
        required: ['content', 'pageId'],
      },
    },
  },
];

// ── Tool execution ─────────────────────────────────────────────────────────
async function executeTool(name: string, args: Record<string, any>): Promise<string> {
  try {
    switch (name) {
      case 'update_dashboard_filters':
        return JSON.stringify({ action: 'update_filters', ...args });

      case 'regenerate_draft': {
        const supabase = getSupabaseServer();
        console.log('[regenerate_draft] Raw args:', args);
        let query = supabase
          .from('posts')
          .select('id, article_url, article_title, source, description, facebook_text, emoji_title, summary');
        if (args.postId) {
          const id = args.postId.replace(/^#+/, '').trim();
          if (id.length === 36 && id.includes('-')) {
            query = query.eq('id', id);
          } else {
            query = query.filter('id::text', 'like', `${id}%`);
          }
        } else if (args.articleUrl) {
          query = query.eq('article_url', args.articleUrl);
        } else {
          return JSON.stringify({ error: 'Provide either postId or articleUrl' });
        }
        
        const { data: post, error } = await query.single();
        if (!post) {
          return JSON.stringify({ error: `Post not found in database. Error: ${error?.message || 'null'}` });
        }

        const prompt = `You are a Vietnamese social media content writer. Regenerate ONLY the "${args.field}" field.
Instructions: ${args.instructions}
Article: ${post.article_title}
Description: ${post.description ?? ''}
Existing content: ${post.facebook_text ?? post.emoji_title ?? post.summary ?? ''}
Return ONLY the regenerated value as plain text. MUST BE IN VIETNAMESE.`;
        
        const result = await openai.chat.completions.create({
          model: DEFAULT_MODEL,
          messages: [{ role: 'user', content: prompt }],
        });

        const newText = result.choices[0]?.message?.content?.trim() || '';
        const columnMap: Record<string, string> = {
          facebook_text: 'facebook_text',
          emoji_title: 'emoji_title',
          summary: 'summary',
        };
        await supabase.from('posts').update({ [columnMap[args.field]]: newText }).eq('id', post.id);
        return JSON.stringify({ action: 'regenerated', field: args.field, newText, articleUrl: post.article_url });
      }

      case 'schedule_post': {
        const supabase = getSupabaseServer();
        let query = supabase.from('posts').update({ status: 'scheduled', scheduled_at: args.scheduledAt });
        
        if (args.postId) {
          const id = args.postId.replace(/^#+/, '').trim();
          query = (id.length === 36 && id.includes('-')) 
            ? query.eq('id', id)
            : query.filter('id::text', 'like', `${id}%`);
        } else if (args.articleUrl) {
          query = query.eq('article_url', args.articleUrl);
        } else {
          return JSON.stringify({ error: 'Provide either postId or articleUrl' });
        }
        
        const { error } = await query;
        return error
          ? JSON.stringify({ error: error.message })
          : JSON.stringify({ action: 'scheduled', scheduledAt: args.scheduledAt });
      }

      case 'scrape_custom_url': {
        const resp = await fetch(args.url, {
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(15000),
        });
        const html = await resp.text();
        const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000);
        
        const prompt = `User wants: "${args.instructions}"\n\nPage content from ${args.url}:\n${text}\n\nProvide a concise Vietnamese summary focused on what the user asked.`;
        const result = await openai.chat.completions.create({
          model: DEFAULT_MODEL,
          messages: [{ role: 'user', content: prompt }],
        });
        const summary = result.choices[0]?.message?.content?.trim() || '';
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

const SYSTEM_INSTRUCTION = `You are an AI copilot embedded in a Vietnamese social media content management dashboard called "Auto Social Posting". Help the user:
- Filter and find posts (use update_dashboard_filters tool)
- Regenerate post drafts with custom instructions (use regenerate_draft tool)
- Schedule posts to channels (use schedule_post tool)
- Fetch data from custom URLs and summarize (use scrape_custom_url tool)
- Push scraped content through the pipeline after user confirms (use push_to_pipeline tool)

Always respond in the same language the user uses. Default to Vietnamese. Be concise and action-oriented.
When a tool runs successfully, acknowledge the action and ask if the user wants to do anything else.`;

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
        const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: 'system', content: SYSTEM_INSTRUCTION }
        ];

        // Format history
        for (let i = 0; i < messages.length - 1; i++) {
          const m = messages[i];
          openaiMessages.push({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content || '',
          });
        }

        const lastMessage = messages[messages.length - 1];
        const userText = `[pageId: ${pageId}, current filters: ${JSON.stringify(currentFilters)}]\n${lastMessage.content}`;
        openaiMessages.push({ role: 'user', content: userText });

        const streamRes = await openai.chat.completions.create({
          model: DEFAULT_MODEL,
          messages: openaiMessages,
          tools: tools,
          tool_choice: 'auto',
          stream: true,
        });

        let fullContent = '';
        let toolCalls: any[] = [];
        let functionCallResult: Record<string, any> | undefined = undefined;

        for await (const chunk of streamRes) {
          const delta = chunk.choices[0]?.delta;
          
          if (delta?.content) {
            fullContent += delta.content;
            send({ type: 'text_delta', content: delta.content });
          }
          
          if (delta?.tool_calls) {
            for (const toolCallDelta of delta.tool_calls) {
              const idx = toolCallDelta.index;
              if (!toolCalls[idx]) {
                toolCalls[idx] = {
                  id: toolCallDelta.id || `call_${idx}`,
                  type: 'function',
                  function: { name: toolCallDelta.function?.name || '', arguments: '' }
                };
              }
              if (toolCallDelta.function?.arguments) {
                toolCalls[idx].function.arguments += toolCallDelta.function.arguments;
              }
            }
          }
        }

        // If tools were called, execute them and make a follow-up request
        if (toolCalls.length > 0) {
          openaiMessages.push({
            role: 'assistant',
            content: fullContent || null,
            tool_calls: toolCalls,
          } as OpenAI.Chat.Completions.ChatCompletionMessageParam);

          let resultsCount = 0;
          for (const call of toolCalls) {
            if (!call || !call.function || !call.function.name) continue;
            try {
              const argsStr = call.function.arguments || '{}';
              const args = JSON.parse(argsStr);
              const result = await executeTool(call.function.name, args);
              const parsed = JSON.parse(result);
              
              send({ type: 'tool_result', tool: call.function.name, result: parsed });
              
              openaiMessages.push({
                role: 'tool',
                tool_call_id: call.id,
                content: result,
              });
              resultsCount++;
            } catch (err) {
              console.error(`Error executing tool ${call.function?.name}:`, err);
              openaiMessages.push({
                role: 'tool',
                tool_call_id: call.id,
                content: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
              });
              resultsCount++;
            }
          }

          if (resultsCount > 0) {
            // Follow up request to let agent respond with tool results
            const followUpRes = await openai.chat.completions.create({
              model: DEFAULT_MODEL,
              messages: openaiMessages,
              stream: true,
            });

            for await (const chunk of followUpRes) {
              const delta = chunk.choices[0]?.delta;
              if (delta?.content) {
                fullContent += delta.content;
                send({ type: 'text_delta', content: delta.content });
              }
            }
          }
        }

        send({ type: 'text', content: fullContent });
        send({ type: 'done' });
      } catch (err) {
        console.error('[OpenRouter API Error]', err);
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
