'use client';

interface PaginationProps {
  totalCount: number;
  limit: number;
  offset: number;
  onPageChange: (offset: number) => void;
}

export default function Pagination({ totalCount, limit, offset, onPageChange }: PaginationProps) {
  if (totalCount <= limit) return null;

  const totalPages = Math.ceil(totalCount / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  const pages: number[] = [];
  const maxVisible = 7;

  if (totalPages <= maxVisible) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    let start = Math.max(2, currentPage - 2);
    let end = Math.min(totalPages - 1, currentPage + 2);

    if (start > 2) pages.push(-1); // ellipsis
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push(-2); // ellipsis
    pages.push(totalPages);
  }

  const buttonStyle = (isActive: boolean, isDisabled: boolean) => ({
    backgroundColor: isActive ? '#f0e523' : '#161b22',
    color: isActive ? '#000' : isDisabled ? '#484f58' : '#c9d1d9',
    border: `1px solid ${isActive ? '#f0e523' : '#30363d'}`,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.5 : 1,
  });

  return (
    <div className="flex items-center justify-center gap-1 py-4">
      <button
        onClick={() => onPageChange(Math.max(0, offset - limit))}
        disabled={currentPage === 1}
        className="px-3 py-1.5 rounded-lg text-sm font-medium"
        style={buttonStyle(false, currentPage === 1)}
      >
        ← Prev
      </button>

      {pages.map((page, idx) =>
        page < 0 ? (
          <span key={`ellipsis-${idx}`} className="px-2 text-sm" style={{ color: '#484f58' }}>
            ...
          </span>
        ) : (
          <button
            key={page}
            onClick={() => onPageChange((page - 1) * limit)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium min-w-[36px]"
            style={buttonStyle(page === currentPage, false)}
          >
            {page}
          </button>
        ),
      )}

      <button
        onClick={() => onPageChange(offset + limit)}
        disabled={currentPage === totalPages}
        className="px-3 py-1.5 rounded-lg text-sm font-medium"
        style={buttonStyle(false, currentPage === totalPages)}
      >
        Next →
      </button>

      <span className="ml-3 text-xs" style={{ color: '#8b949e' }}>
        {totalCount} total
      </span>
    </div>
  );
}
