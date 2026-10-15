'use client';

import React, { useState } from 'react';
import {
  Search,
  Trash2,
  Download,
  RotateCcw,
  Film,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  X,
} from 'lucide-react';
import { DownloadHistoryItem } from '@/lib/types';

interface HistorySectionProps {
  history: DownloadHistoryItem[];
  onRefreshHistory: () => void;
  onDeleteHistoryItem: (id: string) => void;
  onClearHistory: () => void;
  onAnalyzeUrl: (url: string) => void;
  onSaveFile: (jobId: string) => void;
  onBack: () => void;
}

export const HistorySection: React.FC<HistorySectionProps> = ({
  history,
  onDeleteHistoryItem,
  onClearHistory,
  onAnalyzeUrl,
  onSaveFile,
  onBack,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'failed'>('all');

  const filtered = history.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.url.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (filterStatus === 'all') return true;
    if (filterStatus === 'completed') return item.status === 'completed';
    if (filterStatus === 'failed') return item.status === 'failed' || item.status === 'cancelled';
    return true;
  });

  const formatSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="w-full text-[#f0f0f3]">
      {/* Top Bar for History View */}
      <div className="flex items-center justify-between pb-4 border-b border-[#2e3039] mb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-white hover:bg-[#1a1b21] transition-colors cursor-pointer"
            title="Back to main"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-normal text-white">Download history</h2>
        </div>

        {history.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Clear all history records?')) {
                onClearHistory();
              }
            }}
            className="text-xs text-[#9aa0a6] hover:text-red-400 px-3 py-1.5 rounded-lg hover:bg-[#1a1b21] transition-colors cursor-pointer"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Outlined Search Bar */}
      <div className="relative mb-3">
        <Search className="w-4 h-4 text-[#9aa0a6] absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search history"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[#111216] border border-[#2e3039] rounded-xl pl-10 pr-9 py-2.5 text-sm text-[#f0f0f3] placeholder-[#6b7280] focus:outline-none focus:border-[#7e9fd6] transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="p-1 rounded text-[#9aa0a6] hover:text-white absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-2 mb-4 text-xs">
        <button
          type="button"
          onClick={() => setFilterStatus('all')}
          className={`px-3 py-1 rounded-lg border transition-colors cursor-pointer ${
            filterStatus === 'all'
              ? 'bg-[#344F87] text-white border-transparent'
              : 'bg-[#1a1b21] text-[#9aa0a6] border-[#2e3039]'
          }`}
        >
          All ({history.length})
        </button>
        <button
          type="button"
          onClick={() => setFilterStatus('completed')}
          className={`px-3 py-1 rounded-lg border transition-colors cursor-pointer ${
            filterStatus === 'completed'
              ? 'bg-[#344F87] text-white border-transparent'
              : 'bg-[#1a1b21] text-[#9aa0a6] border-[#2e3039]'
          }`}
        >
          Completed
        </button>
        <button
          type="button"
          onClick={() => setFilterStatus('failed')}
          className={`px-3 py-1 rounded-lg border transition-colors cursor-pointer ${
            filterStatus === 'failed'
              ? 'bg-[#344F87] text-white border-transparent'
              : 'bg-[#1a1b21] text-[#9aa0a6] border-[#2e3039]'
          }`}
        >
          Failed
        </button>
      </div>

      {/* History List */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-[#9aa0a6]">
          No downloads found
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((item) => {
            const isCompleted = item.status === 'completed';
            const isFailed = item.status === 'failed' || item.status === 'cancelled';

            return (
              <div
                key={item.id}
                className="bg-[#1a1b21] border border-[#2e3039] rounded-xl p-3 flex items-center justify-between gap-3 text-sm"
              >
                {/* Media icon / thumbnail */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-14 h-10 rounded-lg overflow-hidden bg-[#111216] border border-[#2e3039] shrink-0">
                    {item.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#9aa0a6]">
                        <Film className="w-4 h-4" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="font-normal text-white truncate max-w-sm">
                      {item.title}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-[#9aa0a6] mt-0.5">
                      <span>{item.quality}</span>
                      <span>·</span>
                      <span className="uppercase font-mono">{item.format}</span>
                      {item.filesize ? (
                        <>
                          <span>·</span>
                          <span>{formatSize(item.filesize)}</span>
                        </>
                      ) : null}
                      <span>·</span>
                      <span>{formatDate(item.created_at)}</span>
                    </div>
                  </div>
                </div>

                {/* Status & Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {isCompleted && (
                    <span className="text-emerald-400 text-xs flex items-center gap-1 mr-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </span>
                  )}
                  {isFailed && (
                    <span className="text-red-400 text-xs flex items-center gap-1 mr-1">
                      <XCircle className="w-3.5 h-3.5" />
                    </span>
                  )}

                  {isCompleted && item.fileExists && (
                    <button
                      type="button"
                      onClick={() => onSaveFile(item.job_id)}
                      className="p-1.5 rounded-lg text-[#9aa0a6] hover:text-white hover:bg-[#22242c] transition-colors cursor-pointer"
                      title="Save again"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onAnalyzeUrl(item.url)}
                    className="p-1.5 rounded-lg text-[#9aa0a6] hover:text-white hover:bg-[#22242c] transition-colors cursor-pointer"
                    title="Load link"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteHistoryItem(item.id)}
                    className="p-1.5 rounded-lg text-[#9aa0a6] hover:text-red-400 hover:bg-[#22242c] transition-colors cursor-pointer"
                    title="Delete record"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
