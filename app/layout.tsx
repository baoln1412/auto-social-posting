import type { Metadata } from 'next';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FeedbackHost } from './components/feedback';
import './globals.css';

// The app shell is one page whose JS changes on every deploy. Left prerendered, Next marks
// its HTML `s-maxage=31536000` - a year of CDN caching - and posting.desoul.dev sits behind
// Cloudflare, which kept handing out pre-deploy HTML pointing at old chunks: the caption
// panel's new controls never showed there while the same server showed them over Tailscale.
// Render per request instead. The content-hashed chunks under /_next/static still cache.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Desoul Posting',
  description: 'AI-powered content management and social media publishing platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="bg-background text-foreground antialiased"
        suppressHydrationWarning
      >
        <TooltipProvider>
          {children}
          <FeedbackHost />
        </TooltipProvider>
      </body>
    </html>
  );
}
