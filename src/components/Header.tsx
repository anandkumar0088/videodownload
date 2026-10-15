'use client';

import React from 'react';
import { Settings, History, ListFilter } from 'lucide-react';

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onOpenQueue: () => void;
  activeDownloadsCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onOpenHistory,
  onOpenQueue,
  activeDownloadsCount,
}) => {
  return (
    <header className="w-full bg-[#111216] px-4 sm:px-6 h-14 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Left side: MediaVault icon + Settings gear */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* MediaVault Icon (Seal-inspired minimal brand mark) */}
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-[#d4e3ff] hover:bg-[#1a1b21] transition-colors cursor-pointer">
          <svg
            className="w-5 h-5 fill-current"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            {/* Minimalist Seal/MediaVault emblem */}
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" />
          </svg>
        </div>

        {/* Settings gear icon */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-9 h-9 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-[#f0f0f3] hover:bg-[#1a1b21] transition-colors cursor-pointer"
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Right side: Download Queue + Download History */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Download Queue icon */}
        <button
          type="button"
          onClick={onOpenQueue}
          className="w-9 h-9 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-[#f0f0f3] hover:bg-[#1a1b21] transition-colors relative cursor-pointer"
          title="Download Queue"
          aria-label="Download Queue"
        >
          <ListFilter className="w-5 h-5" />
          {activeDownloadsCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#344F87]" />
          )}
        </button>

        {/* Download History icon */}
        <button
          type="button"
          onClick={onOpenHistory}
          className="w-9 h-9 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-[#f0f0f3] hover:bg-[#1a1b21] transition-colors cursor-pointer"
          title="Download History"
          aria-label="Download History"
        >
          <History className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};
