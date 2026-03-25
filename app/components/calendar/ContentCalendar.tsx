'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface CalendarPost {
  id: string;
  emojiTitle: string;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  pubDate: string;
  source: string;
}

interface ContentCalendarProps {
  pageId: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-stone-200 text-stone-700',
  scheduled: 'bg-amber-100 text-amber-700',
  published: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // Mon=0
  const totalDays = lastDay.getDate();

  const days: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) days.push(null);
  for (let i = 1; i <= totalDays; i++) days.push(i);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function formatDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function ContentCalendar({ pageId }: ContentCalendarProps) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const to = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;

      const res = await fetch(`/api/posts?pageId=${pageId}&from=${from}&to=${to}&limit=200`);
      const data = await res.json();
      setPosts(
        (data.posts ?? []).map((p: any) => ({
          id: p.article?.url ?? '',
          emojiTitle: p.emojiTitle ?? '',
          status: p.status ?? 'draft',
          scheduledAt: p.scheduledAt,
          publishedAt: p.publishedAt,
          pubDate: p.article?.pubDate ?? '',
          source: p.article?.source ?? '',
        }))
      );
    } catch (err) {
      console.error('Calendar load error:', err);
    } finally {
      setLoading(false);
    }
  }, [pageId, year, month]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  // Group posts by day
  const postsByDay = posts.reduce<Record<string, CalendarPost[]>>((acc, post) => {
    const dateStr = post.scheduledAt || post.publishedAt || post.pubDate;
    if (!dateStr) return acc;
    try {
      const d = new Date(dateStr);
      const key = formatDateKey(d.getFullYear(), d.getMonth(), d.getDate());
      if (!acc[key]) acc[key] = [];
      acc[key].push(post);
    } catch {}
    return acc;
  }, {});

  const days = getMonthDays(year, month);
  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const prevMonth = () => {
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else setMonth(month - 1);
    setSelectedDay(null);
  };

  const nextMonth = () => {
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else setMonth(month + 1);
    setSelectedDay(null);
  };

  const selectedKey = selectedDay ? formatDateKey(year, month, selectedDay) : null;
  const selectedPosts = selectedKey ? postsByDay[selectedKey] ?? [] : [];

  return (
    <div className="flex gap-6 h-full">
      {/* Calendar grid */}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-foreground">
            {MONTHS[month]} {year}
          </h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={prevMonth}>‹ Prev</Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDay(today.getDate()); }}
            >
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={nextMonth}>Next ›</Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-muted-foreground">Loading calendar...</div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden bg-card">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 bg-muted/50">
              {WEEKDAYS.map((d) => (
                <div key={d} className="px-2 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {d}
                </div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7">
              {days.map((day, i) => {
                if (day === null) {
                  return <div key={`empty-${i}`} className="min-h-[100px] border-t border-r border-border bg-muted/20 last:border-r-0" />;
                }

                const key = formatDateKey(year, month, day);
                const isToday = key === todayKey;
                const isSelected = day === selectedDay;
                const dayPosts = postsByDay[key] ?? [];

                return (
                  <div
                    key={key}
                    onClick={() => setSelectedDay(day)}
                    className={`min-h-[100px] border-t border-r border-border p-1.5 cursor-pointer transition-colors hover:bg-accent/50
                      ${isSelected ? 'bg-primary/5 ring-2 ring-primary/20' : ''}
                      ${i % 7 === 6 ? 'border-r-0' : ''}
                    `}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full
                        ${isToday ? 'bg-primary text-primary-foreground font-bold' : 'text-foreground'}
                      `}>
                        {day}
                      </span>
                      {dayPosts.length > 0 && (
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {dayPosts.length}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {dayPosts.slice(0, 3).map((post, j) => (
                        <div
                          key={j}
                          className={`text-[10px] px-1.5 py-0.5 rounded truncate font-medium ${STATUS_COLORS[post.status] ?? STATUS_COLORS.draft}`}
                        >
                          {post.emojiTitle.slice(0, 30)}
                        </div>
                      ))}
                      {dayPosts.length > 3 && (
                        <span className="text-[10px] text-muted-foreground pl-1">
                          +{dayPosts.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Day detail panel */}
      <div className="w-80 shrink-0">
        <Card className="card-warm sticky top-20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {selectedDay ? (
                <>📋 {MONTHS[month]} {selectedDay}, {year}</>
              ) : (
                <>📋 Select a day</>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedDay ? (
              <p className="text-sm text-muted-foreground">Click a day on the calendar to see posts.</p>
            ) : selectedPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No posts for this day.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {selectedPosts.map((post, i) => (
                  <div key={i} className="p-3 rounded-lg border border-border bg-background hover:bg-accent/50 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">
                        {post.emojiTitle}
                      </p>
                      <Badge variant="secondary" className={`text-[10px] shrink-0 ${STATUS_COLORS[post.status]}`}>
                        {post.status}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{post.source}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
