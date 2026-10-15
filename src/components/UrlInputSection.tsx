'use client';

import React, { useState } from 'react';
import { Search, Clipboard, X, ArrowRight, Loader2, Sparkles, Check } from 'lucide-react';

interface UrlInputSectionProps {
  url: string;
  setUrl: (url: string) => void;
  onAnalyze: (urlToAnalyze?: string) => void;
  isAnalyzing: boolean;
}

const SAMPLE_VIDEOS = [
  {
    title: 'Big Buck Bunny 60fps (3840×2160 CC)',
    url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    type: '🌟 YouTube 4K UHD',
  },
  {
    title: 'Shorts Upload Guide (Vertical 9:16)',
    url: 'https://www.youtube.com/watch?v=TvsvNdj2rxM',
    type: '📱 Vertical Short',
  },
  {
    title: 'Blender Open Movie Teaser',
    url: 'https://www.youtube.com/watch?v=gWw23EYM9VM',
    type: '🎬 1080p FHD',
  },
];

export const UrlInputSection: React.FC<UrlInputSectionProps> = ({
  url,
  setUrl,
  onAnalyze,
  isAnalyzing,
}) => {
  const [pasteSuccess, setPasteSuccess] = useState(false);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim().startsWith('http')) {
        setUrl(text.trim());
        setPasteSuccess(true);
        setTimeout(() => setPasteSuccess(false), 2000);
      }
    } catch {
      // Clipboard access blocked by browser permission
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isAnalyzing && url.trim()) {
      onAnalyze();
    }
  };

  return (
    <div className="w-full">
      {/* Search Input Container */}
      <div className="relative group">
        <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-cyan-500/20 via-emerald-500/20 to-purple-500/20 blur-xl opacity-75 group-hover:opacity-100 transition duration-500 group-hover:duration-200 pointer-events-none" />

        <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center bg-[#11131c] border border-zinc-700/80 rounded-2xl shadow-2xl p-2 gap-2 focus-within:border-cyan-500/80 focus-within:ring-2 focus-within:ring-cyan-500/20 transition-all">
          <div className="flex items-center flex-1 px-3 gap-3">
            <Search className="w-5 h-5 text-zinc-400 group-focus-within:text-cyan-400 transition-colors shrink-0" />
            <input
              type="url"
              placeholder="Paste any supported video URL (YouTube, Shorts, Vimeo, etc.)..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isAnalyzing}
              className="w-full bg-transparent text-sm sm:text-base text-white placeholder-zinc-500 focus:outline-none disabled:opacity-50"
            />
            {url && (
              <button
                type="button"
                onClick={() => setUrl('')}
                className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                title="Clear input"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handlePaste}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-700/80 transition-colors border border-zinc-700/50"
              title="Paste from clipboard"
            >
              {pasteSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Pasted</span>
                </>
              ) : (
                <>
                  <Clipboard className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Paste</span>
                </>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={() => onAnalyze()}
            disabled={isAnalyzing || !url.trim()}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-zinc-950 font-semibold text-sm transition-all duration-200 shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-cyan-500 disabled:hover:to-emerald-500 active:scale-[0.98]"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-zinc-950" />
                <span>Analyzing...</span>
              </>
            ) : (
              <>
                <span>Analyze Media</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Quick Test Sample Chips */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-500 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-cyan-400" />
          Test Samples:
        </span>
        {SAMPLE_VIDEOS.map((sample, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => {
              setUrl(sample.url);
              onAnalyze(sample.url);
            }}
            disabled={isAnalyzing}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white transition-all text-[11px]"
          >
            <span className="text-cyan-400">[{sample.type}]</span>
            <span>{sample.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
