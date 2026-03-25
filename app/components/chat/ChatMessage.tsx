'use client';

import { Message } from './AIChatWindow';

interface ChatMessageProps {
  message: Message;
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br />');
}

function ToolBadge({ tool, result }: { tool: string; result: Record<string, unknown> }) {
  const labels: Record<string, { emoji: string; label: string }> = {
    update_dashboard_filters: { emoji: '🔍', label: 'Cập nhật bộ lọc' },
    regenerate_draft: { emoji: '✍️', label: 'Viết lại bài' },
    schedule_post: { emoji: '📅', label: 'Lên lịch' },
    scrape_custom_url: { emoji: '🌐', label: 'Lấy dữ liệu web' },
    push_to_pipeline: { emoji: '🚀', label: 'Đưa vào pipeline' },
  };
  const info = labels[tool] ?? { emoji: '⚙️', label: tool };
  const hasError = result?.error;
  return (
    <div className={`chat-tool-badge ${hasError ? 'chat-tool-badge--error' : 'chat-tool-badge--success'}`}>
      <span>{info.emoji}</span>
      <span>{hasError ? `Lỗi: ${result.error}` : info.label}</span>
    </div>
  );
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  return (
    <div className={`chat-msg ${isUser ? 'chat-msg--user' : 'chat-msg--assistant'}`}>
      {!isUser && (
        <div className="chat-avatar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
          </svg>
        </div>
      )}
      <div className="chat-msg-body">
        {message.toolResults?.map((tr, i) => (
          <ToolBadge key={i} tool={tr.tool} result={tr.result} />
        ))}
        <div
          className="chat-msg-text"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
        />
      </div>
    </div>
  );
}
