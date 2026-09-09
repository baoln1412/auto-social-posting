'use client';

import { BarChart3, CalendarDays, FileText, Plus, Settings, Skull, TrendingUp } from 'lucide-react';
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
  { id: 'crime', label: 'Crime Series', Icon: Skull },
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
        <div className="flex flex-col items-center gap-1">
          {/* The head is INSIDE the word - it stands in for the O and no font
              contains it, so DESOUL is an image, never typed. wordmark.png is
              the real mark (560x177, transparent); POSTING is set in type but
              styled to match the drawn sub-words (.desoul-subword), not plain
              text, or it reads as a different brand under the logo.
              Font-size is measured, not guessed: at this wordmark's rendered
              height (140px wide -> ~44px tall), cap height must land at 41% of
              that per the skill's spec, and Baloo 2 700's measured cap-height
              ratio (glyph ink bounds via canvas, not the font's line metrics)
              is 0.622 of font-size - so 18.14px cap height needs a 29.2px
              font-size. Re-measure both if wordmark.png's rendered size changes. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wordmark.png" alt="DESOUL" className="w-full max-w-[140px] h-auto" />
          <p className="desoul-subword uppercase" style={{ fontSize: '29.2px' }}>
            Posting
          </p>
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
