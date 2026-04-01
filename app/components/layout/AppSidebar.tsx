'use client';

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
  { id: 'content',   label: 'Content',   icon: '✦' },
  { id: 'calendar',  label: 'Calendar',  icon: '◫' },
  { id: 'analytics', label: 'Analytics', icon: '◈' },
  { id: 'settings',  label: 'Settings',  icon: '◎' },
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'linear-gradient(180deg, hsl(240,10%,5%) 0%, hsl(255,12%,6%) 100%)',
        borderRight: '1px solid hsl(270,20%,12%)',
      }}
    >
      {/* ── Logo ─────────────────────────────────────────────────────── */}
      <div style={{ padding: '24px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px', height: '34px', borderRadius: '10px',
            background: 'linear-gradient(135deg, hsl(270,90%,60%) 0%, hsl(290,85%,55%) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 16px hsl(270,90%,60%/0.35)',
            fontSize: '16px', fontWeight: '800', color: 'white',
            letterSpacing: '-0.02em',
          }}>
            ⚡
          </div>
          <div>
            <h1 style={{
              fontSize: '14px', fontWeight: '800', color: 'white',
              letterSpacing: '-0.02em', margin: 0, lineHeight: 1.2,
            }}>
              AutoSocial
            </h1>
            <p style={{
              fontSize: '10px', color: 'hsl(270,60%,60%)', fontWeight: '600',
              letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0,
            }}>
              Posting
            </p>
          </div>
        </div>
        {/* Thin purple divider under logo */}
        <div style={{
          marginTop: '16px', height: '1px',
          background: 'linear-gradient(90deg, transparent, hsl(270,70%,50%/0.3), transparent)',
        }} />
      </div>

      {/* ── Navigation ───────────────────────────────────────────────── */}
      <nav style={{ flex: 1, padding: '4px 12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', borderRadius: '10px',
                fontSize: '13px', fontWeight: isActive ? '700' : '500',
                cursor: 'pointer', border: 'none', transition: 'all 160ms ease',
                background: isActive
                  ? 'linear-gradient(135deg, hsl(270,60%,20%/0.8) 0%, hsl(270,50%,18%/0.7) 100%)'
                  : 'transparent',
                color: isActive ? 'hsl(270,90%,82%)' : 'hsl(240,10%,60%)',
                boxShadow: isActive
                  ? 'inset 1px 1px 0 hsl(270,80%,60%/0.12), 0 0 0 1px hsl(270,60%,30%/0.3)'
                  : 'none',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'hsl(270,30%,12%/0.6)';
                  e.currentTarget.style.color = 'hsl(0,0%,85%)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'hsl(240,10%,60%)';
                }
              }}
            >
              <span style={{
                width: '28px', height: '28px', borderRadius: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px',
                background: isActive ? 'hsl(270,80%,60%/0.18)' : 'transparent',
                color: isActive ? 'hsl(270,90%,75%)' : 'inherit',
              }}>
                {item.icon}
              </span>
              <span>{item.label}</span>
              {isActive && (
                <span style={{
                  marginLeft: 'auto', width: '6px', height: '6px',
                  borderRadius: '50%', background: 'hsl(270,90%,70%)',
                  boxShadow: '0 0 6px hsl(270,90%,70%/0.6)',
                }} />
              )}
            </button>
          );
        })}

        {/* ── New Page button ───────────────────────────────────────── */}
        <div style={{ paddingTop: '12px' }}>
          <button
            onClick={onAddPage}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '8px', padding: '9px 12px', borderRadius: '10px',
              fontSize: '13px', fontWeight: '600', cursor: 'pointer', transition: 'all 160ms ease',
              border: '1px dashed hsl(270,50%,35%/0.45)',
              background: 'hsl(270,40%,15%/0.2)',
              color: 'hsl(270,70%,70%)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'hsl(270,50%,20%/0.35)';
              e.currentTarget.style.borderColor = 'hsl(270,60%,50%/0.6)';
              e.currentTarget.style.color = 'hsl(270,80%,80%)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'hsl(270,40%,15%/0.2)';
              e.currentTarget.style.borderColor = 'hsl(270,50%,35%/0.45)';
              e.currentTarget.style.color = 'hsl(270,70%,70%)';
            }}
          >
            <span style={{ fontSize: '16px', lineHeight: 1 }}>＋</span>
            <span>New Page</span>
          </button>
        </div>
      </nav>

      {/* ── Page switcher footer ──────────────────────────────────────── */}
      <div style={{ padding: '8px 12px 20px', marginTop: 'auto' }}>
        <div style={{
          height: '1px', marginBottom: '12px',
          background: 'linear-gradient(90deg, transparent, hsl(270,30%,20%/0.5), transparent)',
        }} />
        <p style={{
          padding: '0 12px 6px', fontSize: '10px', fontWeight: '700',
          color: 'hsl(270,40%,45%)', letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          Pages
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {pages.map((page) => {
            const isActive = page.id === activePageId;
            return (
              <button
                key={page.id}
                onClick={() => onPageChange(page.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 12px', borderRadius: '9px',
                  fontSize: '13px', fontWeight: isActive ? '600' : '400',
                  cursor: 'pointer', transition: 'all 150ms ease', textAlign: 'left',
                  border: isActive ? '1px solid hsl(270,50%,30%/0.45)' : '1px solid transparent',
                  background: isActive
                    ? 'linear-gradient(135deg, hsl(270,50%,18%/0.7), hsl(270,40%,15%/0.5))'
                    : 'transparent',
                  color: isActive ? 'hsl(270,80%,78%)' : 'hsl(240,8%,55%)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'hsl(270,20%,10%/0.6)';
                    e.currentTarget.style.color = 'hsl(0,0%,75%)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'hsl(240,8%,55%)';
                  }
                }}
              >
                <span style={{
                  width: '26px', height: '26px', borderRadius: '7px', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: '800',
                  background: isActive
                    ? 'linear-gradient(135deg, hsl(270,90%,60%/0.3), hsl(270,70%,50%/0.2))'
                    : 'hsl(240,8%,12%)',
                  color: isActive ? 'hsl(270,90%,78%)' : 'hsl(240,8%,50%)',
                  border: isActive ? '1px solid hsl(270,60%,40%/0.3)' : '1px solid hsl(240,8%,16%)',
                }}>
                  {page.name.charAt(0).toUpperCase()}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {page.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
