'use client';

import { useState, KeyboardEvent } from 'react';

const SUGGESTIONS = [
  'Lọc bài viết về visa',
  'Hiển thị bài chưa đăng trong tuần này',
  'Lấy thông tin từ homeaffairs.gov.au',
  'Viết lại bài đầu tiên hài hước hơn',
  'Lên lịch bài đầu tiên vào 8h tối nay',
];

export default function ChatInput({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
  const [text, setText] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
    setShowSuggestions(false);
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-input-area">
      {showSuggestions && !disabled && (
        <div className="chat-suggestions">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              className="chat-suggestion-chip"
              onClick={() => { onSend(s); setShowSuggestions(false); }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="chat-input-row">
        <button
          className="chat-suggest-btn"
          onClick={() => setShowSuggestions((v) => !v)}
          title="Gợi ý câu hỏi"
          disabled={disabled}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Nhập câu hỏi... (Enter để gửi)"
          className="chat-textarea"
          rows={1}
          disabled={disabled}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="chat-send-btn"
          title="Gửi"
        >
          {disabled ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="chat-spinner">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
