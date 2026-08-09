'use client';

import { BarChart3, CalendarDays, FileText, Plus, Settings, TrendingUp } from 'lucide-react';
import { ContentPage } from '../../types';

interface AppSidebarProps {
  pages: ContentPage[];
  activePageId: string | null;
  activeView: string;
  onViewChange: (view: string) => void;
  onPageChange: (pageId: string) => void;
  onAddPage: () => void;
}

const NAV_ITEMS = [
  { id: 'content', label: 'Content', Icon: FileText },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { id: 'analytics', label: 'Analytics', Icon: BarChart3 },
  { id: 'usage', label: 'Usage', Icon: TrendingUp },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

export default function AppSidebar({
  pages,
  activePageId,
  activeView,
  onViewChange,
  onPageChange,
  onAddPage,
}: AppSidebarProps) {
  const activePage = pages.find((p) => p.id === activePageId);

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5">
        <div className="flex items-center gap-2">
          {/* The wordmark is type, not an emoji: a filled square in the anchor
              hue reads as a mark at 20px and renders identically everywhere. */}
          <span aria-hidden className="w-5 h-5 rounded-[5px] bg-primary shrink-0" />
          <div>
            <h1 className="text-base font-bold text-primary tracking-tight">
              Auto Social
            </h1>
            <p className="text-[10px] text-muted-foreground font-medium tracking-wider uppercase">
              Posting
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            aria-current={activeView === id ? 'page' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-normal
              transition-colors motion-reduce:transition-none
              ${activeView === id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-foreground hover:bg-accent'
              }`}
          >
            <Icon size={16} className="shrink-0" />
            <span>{label}</span>
          </button>
        ))}

        {/* Add New Page button */}
        <div className="pt-4">
          <button
            onClick={onAddPage}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors motion-reduce:transition-none border-2 border-dashed border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50"
          >
            <Plus size={16} className="shrink-0" />
            <span>New Page</span>
          </button>
        </div>
      </nav>

      {/* Footer: Page switcher */}
      <div className="px-3 pb-4 mt-auto">
        {/* Page list */}
        <div className="space-y-1 mb-2">
          <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Pages
          </p>
          {pages.map((page) => (
            <button
              key={page.id}
              onClick={() => onPageChange(page.id)}
              aria-current={page.id === activePageId ? 'true' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors motion-reduce:transition-none text-left
                ${page.id === activePageId
                  ? 'bg-primary/10 text-primary font-semibold border border-primary/20'
                  : 'text-foreground hover:bg-accent border border-transparent'
                }`}
            >
              <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                {page.name.charAt(0)}
              </span>
              <span className="truncate">{page.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
