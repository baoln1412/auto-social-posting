'use client';

import { useState } from 'react';
import AppSidebar from './AppSidebar';
import { ContentPage } from '../../types';

interface AppLayoutProps {
  children: React.ReactNode;
  pages: ContentPage[];
  activePageId: string | null;
  activeView: string;
  activePageName: string;
  onViewChange: (view: string) => void;
  onPageChange: (pageId: string) => void;
  onAddPage: () => void;
}

const VIEW_LABELS: Record<string, string> = {
  content: '📝 Content',
  calendar: '📅 Calendar',
  analytics: '📊 Analytics',
  settings: '⚙️ Settings',
};

export default function AppLayout({
  children,
  pages,
  activePageId,
  activeView,
  activePageName,
  onViewChange,
  onPageChange,
  onAddPage,
}: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className="shrink-0 transition-all duration-200 ease-in-out overflow-hidden border-r border-border"
        style={{ width: sidebarOpen ? '16rem' : '0rem' }}
      >
        <div className="w-64 h-screen sticky top-0 overflow-y-auto bg-sidebar">
          <AppSidebar
            pages={pages}
            activePageId={activePageId}
            activeView={activeView}
            onViewChange={onViewChange}
            onPageChange={onPageChange}
            onAddPage={onAddPage}
          />
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="flex h-14 items-center gap-3 border-b border-border px-4 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-accent transition-colors text-muted-foreground"
            title="Toggle sidebar"
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
          <div className="h-5 w-px bg-border" />
          <nav className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">{activePageName}</span>
            <span className="text-muted-foreground/50">›</span>
            <span className="font-semibold text-foreground">
              {VIEW_LABELS[activeView] ?? activeView}
            </span>
          </nav>
        </header>

        {/* Main content */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
