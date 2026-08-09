'use client';

import { Plus } from 'lucide-react';
import { ContentPage } from '@/app/types';

interface PageTabsProps {
  pages: ContentPage[];
  activePageId: string | null;
  onSelect: (pageId: string) => void;
  onAddPage: () => void;
}

export default function PageTabs({ pages, activePageId, onSelect, onAddPage }: PageTabsProps) {
  return (
    <div className="flex items-center gap-1 border-b border-border overflow-x-auto pb-0">
      {pages.map((page) => {
        const isActive = page.id === activePageId;
        return (
          <button
            key={page.id}
            onClick={() => onSelect(page.id)}
            aria-current={isActive ? 'page' : undefined}
            className={`px-4 py-2.5 text-sm font-normal whitespace-nowrap rounded-t-lg border-b-2
              transition-colors duration-150
              ${isActive
                ? 'bg-card text-primary border-primary'
                : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-accent'
              }`}
          >
            {page.countryCode ? `${page.countryCode} · ${page.name}` : page.name}
          </button>
        );
      })}
      <button
        onClick={onAddPage}
        className="px-3 py-2.5 rounded-t-lg text-muted-foreground transition-colors duration-150 hover:text-foreground hover:bg-accent"
        title="Add new page"
        aria-label="Add new page"
      >
        <Plus size={18} />
      </button>
    </div>
  );
}
