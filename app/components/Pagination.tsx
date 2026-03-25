'use client';

import { Button } from '@/components/ui/button';

interface PaginationProps {
  totalCount: number;
  limit: number;
  offset: number;
  onPageChange: (newOffset: number) => void;
}

export default function Pagination({ totalCount, limit, offset, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(totalCount / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const maxVisible = 5;
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-center gap-1 py-4">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(0)}
        disabled={currentPage === 1}
        className="text-xs"
      >
        « First
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(Math.max(0, offset - limit))}
        disabled={currentPage === 1}
        className="text-xs"
      >
        ‹ Prev
      </Button>

      {pages.map((page) => (
        <Button
          key={page}
          variant={page === currentPage ? 'default' : 'outline'}
          size="sm"
          onClick={() => onPageChange((page - 1) * limit)}
          className="text-xs min-w-[32px]"
        >
          {page}
        </Button>
      ))}

      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(offset + limit)}
        disabled={currentPage === totalPages}
        className="text-xs"
      >
        Next ›
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange((totalPages - 1) * limit)}
        disabled={currentPage === totalPages}
        className="text-xs"
      >
        Last »
      </Button>
    </div>
  );
}
