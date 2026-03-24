import type { Metadata } from 'next';
import './globals.css';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'Crime News Draft Tool',
  description: 'Generate Facebook post drafts from crime news',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body
        style={{ backgroundColor: '#0a0a0a', color: '#ffffff' }}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
