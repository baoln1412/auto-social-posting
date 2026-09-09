import type { Metadata } from 'next';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FeedbackHost } from './components/feedback';
import './globals.css';

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
