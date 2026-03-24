'use client';

import { ContentPage } from '@/app/types';

interface PageTabsProps {
  pages: ContentPage[];
  activePageId: string | null;
  onSelect: (pageId: string) => void;
  onAddPage: () => void;
}

export default function PageTabs({ pages, activePageId, onSelect, onAddPage }: PageTabsProps) {
  return (
    <div className="flex items-center gap-1 border-b border-[#1e293b] overflow-x-auto pb-0">
      {pages.map((page) => {
        const isActive = page.id === activePageId;
        return (
          <button
            key={page.id}
            onClick={() => onSelect(page.id)}
            className="px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all duration-150 rounded-t-lg"
            style={{
              backgroundColor: isActive ? '#161b22' : 'transparent',
              color: isActive ? '#f0e523' : '#8b949e',
              borderBottom: isActive ? '2px solid #f0e523' : '2px solid transparent',
            }}
          >
            {page.name}
          </button>
        );
      })}
      <button
        onClick={onAddPage}
        className="px-3 py-2.5 text-lg font-bold transition-all duration-150 rounded-t-lg hover:bg-[#161b22]"
        style={{ color: '#8b949e' }}
        title="Add new page"
      >
        +
      </button>
    </div>
  );
}
