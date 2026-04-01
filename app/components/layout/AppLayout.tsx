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
    <div className="flex min-h-screen" style={{ background: 'hsl(240,10%,4%)' }}>
      {/* Sidebar */}
      <aside
        className="shrink-0 transition-all duration-200 ease-in-out overflow-hidden"
        style={{
          width: sidebarOpen ? '16rem' : '0rem',
          borderRight: '1px solid hsl(270,20%,10%)',
        }}
      >
        <div style={{ width: '256px', height: '100vh', position: 'sticky', top: 0, overflowY: 'auto' }}>
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
        <header style={{
          display: 'flex', height: '56px', alignItems: 'center', gap: '12px',
          borderBottom: '1px solid hsl(270,20%,10%)',
          padding: '0 20px',
          background: 'hsl(240,10%,5%/0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          position: 'sticky', top: 0, zIndex: 10,
          boxShadow: '0 1px 0 hsl(270,50%,40%/0.06)',
        }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              width: '32px', height: '32px', borderRadius: '8px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'hsl(240,8%,50%)', fontSize: '14px',
              transition: 'background 150ms, color 150ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'hsl(270,30%,14%)';
              e.currentTarget.style.color = 'hsl(270,80%,75%)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.color = 'hsl(240,8%,50%)';
            }}
            title="Toggle sidebar"
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
          <div style={{ width: '1px', height: '18px', background: 'hsl(270,20%,14%)' }} />
          <nav style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <span style={{ color: 'hsl(240,8%,50%)' }}>{activePageName}</span>
            <span style={{ color: 'hsl(270,40%,35%)' }}>›</span>
            <span style={{ fontWeight: 600, color: 'hsl(0,0%,92%)' }}>
              {VIEW_LABELS[activeView] ?? activeView}
            </span>
          </nav>
          {/* Purple accent line — right aligned glow */}
          <div style={{ flex: 1 }} />
          <div style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: 'hsl(270,90%,65%)',
            boxShadow: '0 0 8px hsl(270,90%,65%/0.7)',
          }} />
        </header>

        {/* Main content */}
        <main style={{ flex: 1, padding: '24px' }}>
          {children}
        </main>
      </div>
    </div>
  );

}
