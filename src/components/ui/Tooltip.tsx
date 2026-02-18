import type { ReactNode } from 'react';

export function Tooltip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="relative group">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1
                      bg-gray-900 text-white text-xs rounded whitespace-nowrap
                      opacity-0 group-hover:opacity-100 pointer-events-none
                      transition-opacity duration-200 z-50">
        {label}
        <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2
                        bg-gray-900 transform rotate-45 -mt-1" />
      </div>
    </div>
  );
}
