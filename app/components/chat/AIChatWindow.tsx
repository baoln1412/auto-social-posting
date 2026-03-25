'use client';

import { useState, useRef, useEffect } from 'react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolResults?: Array<{ tool: string; result: Record<string, unknown> }>;
}

export interface DashboardFilters {
  source?: string;
  from?: string;
  to?: string;
  done?: 'all' | 'not_done' | 'done';
}

interface AIChatWindowProps {
  pageId: string;
  currentFilters: DashboardFilters;
  onFiltersChange: (filters: DashboardFilters) => void;
  onPostsRefresh: () => void;
}

export default function AIChatWindow({ pageId, currentFilters, onFiltersChange, onPostsRefresh }: AIChatWindowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '👋 Xin chào! Tôi là AI Copilot của bạn. Tôi có thể giúp bạn:\n- 🔍 **Lọc bài viết** theo nguồn, ngày, trạng thái\n- ✍️ **Viết lại** nội dung bài đăng\n- 📅 **Lên lịch** đăng bài\n- 🌐 **Lấy dữ liệu** từ website bất kỳ\n\nBạn muốn làm gì hôm nay?',
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsLoading(true);
    setStatusText('Đang suy nghĩ...');

    // Placeholder for streaming response
    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages([...updatedMessages, assistantMsg]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages,
          pageId,
          currentFilters,
        }),
      });

      if (!res.body) throw new Error('No stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalContent = '';
      const toolResults: Message['toolResults'] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'text') {
              finalContent = event.content;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: 'assistant', content: finalContent, toolResults };
                return next;
              });
            } else if (event.type === 'tool_result') {
              toolResults.push({ tool: event.tool, result: event.result });
              setStatusText(`⚙️ ${getToolStatusText(event.tool, event.result)}`);

              // Handle UI updates from tools
              if (event.tool === 'update_dashboard_filters') {
                const { source, from, to, done: d } = event.result as DashboardFilters;
                onFiltersChange({
                  ...(source !== undefined && { source }),
                  ...(from !== undefined && { from }),
                  ...(to !== undefined && { to }),
                  ...(d !== undefined && { done: d }),
                });
              } else if (
                event.tool === 'regenerate_draft' ||
                event.tool === 'schedule_post' ||
                event.tool === 'push_to_pipeline'
              ) {
                onPostsRefresh();
              }
            } else if (event.type === 'model_fallback') {
              setStatusText('⚠️ Chuyển sang model dự phòng...');
            } else if (event.type === 'error') {
              finalContent = `❌ Lỗi: ${event.message}`;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: 'assistant', content: finalContent };
                return next;
              });
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: 'assistant',
          content: `❌ Lỗi kết nối: ${err instanceof Error ? err.message : 'Unknown'}`,
        };
        return next;
      });
    } finally {
      setIsLoading(false);
      setStatusText('');
    }
  };

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="chat-fab"
        aria-label="Toggle AI Chat"
        title={isOpen ? 'Đóng AI Chat' : 'Mở AI Copilot'}
      >
        {isOpen ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
        {!isOpen && (
          <span className="chat-fab-badge">AI</span>
        )}
      </button>

      {/* Chat window */}
      {isOpen && (
        <div className="chat-window">
          {/* Header */}
          <div className="chat-header">
            <div className="chat-header-info">
              <span className="chat-header-dot" />
              <div>
                <p className="chat-header-title">AI Copilot</p>
                <p className="chat-header-subtitle">Gemini · Tự động chuyển model khi hết quota</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="chat-close-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <ChatMessage key={i} message={msg} />
            ))}
            {isLoading && statusText && (
              <div className="chat-status-indicator">
                <span className="chat-status-dot" />
                <span className="chat-status-text">{statusText}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <ChatInput onSend={sendMessage} disabled={isLoading} />
        </div>
      )}
    </>
  );
}

function getToolStatusText(tool: string, result: Record<string, unknown>): string {
  switch (tool) {
    case 'update_dashboard_filters': return 'Đang cập nhật bộ lọc...';
    case 'regenerate_draft': return `Đang viết lại ${result.field ?? ''}...`;
    case 'schedule_post': return 'Đang lên lịch bài đăng...';
    case 'scrape_custom_url': return `Đang lấy dữ liệu từ ${result.url ?? 'website'}...`;
    case 'push_to_pipeline': return 'Đang đưa vào pipeline...';
    default: return 'Đang xử lý...';
  }
}
