'use client';

import { useRouter } from 'next/navigation';
import { Play } from 'lucide-react';

/**
 * Forget that the tour was seen, then go to the screen it runs on.
 *
 * The flag is the same `localStorage` key the tour writes, because a second mechanism for "show
 * it again" is a second thing to keep in step with the first.
 */
export function RestartTour({ id = 'new', href = '/studio' }: { id?: string; href?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      data-testid="guide-tour"
      onClick={() => {
        try {
          localStorage.removeItem(`studio.tour.${id}`);
        } catch {
          /* private window: the tour shows every visit anyway */
        }
        router.push(href);
      }}
      className="st-btn st-sm st-primary"
    >
      <Play strokeWidth={2.5} />
      Bắt đầu tour
    </button>
  );
}
