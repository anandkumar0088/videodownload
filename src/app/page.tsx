'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Header } from '@/components/Header';
import { MediaPreviewCard } from '@/components/MediaPreviewCard';
import { DownloadProgressCard } from '@/components/DownloadProgressCard';
import { HistorySection } from '@/components/HistorySection';
import { SettingsModal } from '@/components/SettingsModal';
import { QueueModal } from '@/components/QueueModal';
import {
  VideoMetadata,
  VideoFormatOption,
  DownloadJob,
  DownloadHistoryItem,
} from '@/lib/types';
import {
  Clipboard,
  Download,
  X,
  Loader2,
  AlertCircle,
  Check,
} from 'lucide-react';

const SAMPLES = [
  {
    label: 'Archive.org (Open)',
    url: 'https://archive.org/details/BigBuckBunny_124',
  },
  {
    label: 'Big Buck Bunny (4K)',
    url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
  },
  {
    label: 'Shorts Guide (9:16)',
    url: 'https://www.youtube.com/watch?v=TvsvNdj2rxM',
  },
  {
    label: 'Blender Teaser (1080p)',
    url: 'https://www.youtube.com/watch?v=gWw23EYM9VM',
  },
];

export default function Home() {
  const [currentView, setCurrentView] = useState<'main' | 'history'>('main');
  const [url, setUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [selectedFormatId, setSelectedFormatId] = useState<string>('');

  const [activeJob, setActiveJob] = useState<DownloadJob | null>(null);
  const [isStartingDownload, setIsStartingDownload] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [history, setHistory] = useState<DownloadHistoryItem[]>([]);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  // Paste feedback
  const [pastedFeedback, setPastedFeedback] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const cleanupProgressConnection = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      if (data.success && Array.isArray(data.history)) {
        setHistory(data.history);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      try {
        const res = await fetch('/api/history');
        const data = await res.json();
        if (!ignore && data.success && Array.isArray(data.history)) {
          setHistory(data.history);
        }
      } catch {
        // Ignore
      }
    }
    void loadData();

    return () => {
      ignore = true;
      cleanupProgressConnection();
    };
  }, []);

  // Analyze media URL
  const handleAnalyze = async (targetUrl?: string) => {
    const queryUrl = targetUrl || url;
    if (!queryUrl.trim()) return;

    setIsAnalyzing(true);
    setAnalyzeError(null);
    setDownloadError(null);
    setMetadata(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: queryUrl.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to analyze video URL.');
      }

      setMetadata(data.data);
      setSelectedFormatId(data.data?.formats?.[0]?.formatId || '');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to analyze URL.';
      setAnalyzeError(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Start download job
  const handleStartDownload = async (format: VideoFormatOption) => {
    if (!metadata) return;

    setIsStartingDownload(true);
    setDownloadError(null);
    cleanupProgressConnection();

    try {
      const res = await fetch('/api/download/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: metadata.originalUrl,
          title: metadata.title,
          thumbnail: metadata.thumbnail,
          formatId: format.formatId,
          ext: format.ext,
          quality: format.qualityLabel,
          uploader: metadata.uploader,
          duration: metadata.durationFormatted,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.jobId) {
        throw new Error(data.error || 'Failed to start download job.');
      }

      const jobId = data.jobId;
      setActiveJob({
        jobId,
        url: metadata.originalUrl,
        title: metadata.title,
        thumbnail: metadata.thumbnail,
        formatId: format.formatId,
        ext: format.ext,
        quality: format.qualityLabel,
        status: 'downloading',
        percent: 0,
        speed: 'Connecting...',
        eta: '--:--',
        downloadedBytes: 0,
        totalBytes: 0,
        createdAt: new Date().toISOString(),
      });

      connectProgressStream(jobId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to launch download.';
      setDownloadError(msg);
    } finally {
      setIsStartingDownload(false);
    }
  };

  // Connect SSE for live progress
  const connectProgressStream = (jobId: string) => {
    cleanupProgressConnection();

    try {
      const sse = new EventSource(`/api/download/progress/${jobId}`);
      eventSourceRef.current = sse;

      sse.onmessage = (event) => {
        try {
          const updatedJob = JSON.parse(event.data) as DownloadJob;
          setActiveJob(updatedJob);

          if (
            updatedJob.status === 'completed' ||
            updatedJob.status === 'failed' ||
            updatedJob.status === 'cancelled'
          ) {
            fetchHistory();
          }
        } catch {
          // Ignore
        }
      };

      sse.onerror = () => {
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        startPollingStatus(jobId);
      };
    } catch {
      startPollingStatus(jobId);
    }
  };

  // Fallback Polling
  const startPollingStatus = (jobId: string) => {
    if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);

    pollingTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/download/status/${jobId}`);
        const data = await res.json();
        if (data.success && data.job) {
          setActiveJob(data.job);
          if (
            data.job.status === 'completed' ||
            data.job.status === 'failed' ||
            data.job.status === 'cancelled'
          ) {
            if (pollingTimerRef.current) {
              clearInterval(pollingTimerRef.current);
              pollingTimerRef.current = null;
            }
            fetchHistory();
          }
        }
      } catch {
        // Ignore
      }
    }, 1500);
  };

  // Cancel download
  const handleCancelDownload = async (jobId: string) => {
    try {
      await fetch(`/api/download/cancel/${jobId}`, { method: 'POST' });
      setActiveJob((prev) => (prev ? { ...prev, status: 'cancelled' } : null));
      cleanupProgressConnection();
      fetchHistory();
    } catch {
      // Ignore
    }
  };

  // Browser download trigger
  const handleSaveFileToBrowser = (jobId: string) => {
    const downloadUrl = `/api/download/file/${jobId}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // History operations
  const handleDeleteHistory = async (id: string) => {
    try {
      await fetch(`/api/history/${id}`, { method: 'DELETE' });
      fetchHistory();
    } catch {
      // Ignore
    }
  };

  const handleClearAllHistory = async () => {
    try {
      await fetch('/api/history', { method: 'DELETE' });
      fetchHistory();
    } catch {
      // Ignore
    }
  };

  // Paste Action from FAB
  const handlePasteFab = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim().startsWith('http')) {
        const cleanUrl = text.trim();
        setUrl(cleanUrl);
        setPastedFeedback(true);
        setTimeout(() => setPastedFeedback(false), 2000);
        handleAnalyze(cleanUrl);
      }
    } catch {
      // Browser permission prompt or fallback
      const fallbackUrl = prompt('Enter or paste video URL:');
      if (fallbackUrl && fallbackUrl.trim().startsWith('http')) {
        setUrl(fallbackUrl.trim());
        handleAnalyze(fallbackUrl.trim());
      }
    }
  };

  // Download Action from FAB
  const handleDownloadFab = () => {
    if (metadata && metadata.formats.length > 0) {
      const selectedFormat =
        metadata.formats.find((f) => f.formatId === selectedFormatId) ||
        metadata.formats[0];
      handleStartDownload(selectedFormat);
    } else if (url.trim()) {
      handleAnalyze(url.trim());
    } else {
      handlePasteFab();
    }
  };

  return (
    <div className="min-h-screen bg-[#111216] text-[#f0f0f3] flex flex-col relative font-sans">
      {/* Top Bar matching Seal Android header */}
      <Header
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenHistory={() => setCurrentView('history')}
        onOpenQueue={() => setIsQueueOpen(true)}
        activeDownloadsCount={
          activeJob && (activeJob.status === 'downloading' || activeJob.status === 'merging')
            ? 1
            : 0
        }
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-32 flex flex-col justify-start">
        {currentView === 'main' ? (
          <>
            {/* Main Heading: "MediaVault" in large, regular-weight white text */}
            <h1 className="text-4xl sm:text-5xl font-normal text-white tracking-tight mb-6 sm:mb-8 select-none">
              MediaVault
            </h1>

            {/* Outlined Input Box: subtle gray border, small radius, transparent dark fill, "Video link" placeholder */}
            <div className="relative w-full mb-3">
              <input
                type="url"
                placeholder="Video link"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && url.trim()) {
                    handleAnalyze();
                  }
                }}
                disabled={isAnalyzing}
                className="w-full bg-[#111216] border border-[#2e3039] focus:border-[#7e9fd6] rounded-xl px-4 py-3.5 text-base text-[#f0f0f3] placeholder-[#6b7280] transition-colors pr-10"
              />
              {url && (
                <button
                  type="button"
                  onClick={() => {
                    setUrl('');
                    setMetadata(null);
                    setAnalyzeError(null);
                  }}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-white absolute right-3 top-1/2 -translate-y-1/2 transition-colors cursor-pointer"
                  title="Clear input"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Minimal Sample Chips for 1-Click Testing */}
            <div className="flex flex-wrap items-center gap-1.5 mb-6 text-xs text-[#9aa0a6]">
              <span className="text-[11px] text-[#6b7280] mr-1">Quick test:</span>
              {SAMPLES.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setUrl(sample.url);
                    handleAnalyze(sample.url);
                  }}
                  disabled={isAnalyzing}
                  className="px-2.5 py-1 rounded-lg bg-[#1a1b21] hover:bg-[#22242c] border border-[#2e3039] text-[#9aa0a6] hover:text-white transition-colors text-[11px] cursor-pointer"
                >
                  {sample.label}
                </button>
              ))}
            </div>

            {/* Analyzing Spinner Status */}
            {isAnalyzing && (
              <div className="py-6 flex items-center justify-center gap-2 text-sm text-[#9aa0a6]">
                <Loader2 className="w-4 h-4 animate-spin text-[#7e9fd6]" />
                <span>Fetching video information...</span>
              </div>
            )}

            {/* Analyze Error Message */}
            {analyzeError && (
              analyzeError.toLowerCase().includes('youtube has restricted') ||
              analyzeError.toLowerCase().includes('automated access') ||
              analyzeError.toLowerCase().includes('yt_cookies') ||
              analyzeError.toLowerCase().includes('bot') ? (
                <div className="w-full p-4 mb-5 rounded-2xl bg-[#20181b] border border-[#5a2830] text-[#f0f0f3] text-xs">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 text-red-400 font-medium">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>YouTube Cloud IP Restriction</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAnalyzeError(null)}
                      className="text-[#9aa0a6] hover:text-white cursor-pointer"
                      title="Dismiss"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[#d1d5db] text-xs leading-relaxed mb-3">
                    YouTube has restricted automated requests on this cloud server IP. This is an access-control restriction enforced by YouTube on cloud datacenters, not a MediaVault backend failure.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-[#402228]">
                    <span className="text-[#9ca3af] text-[11px]">Supported alternative:</span>
                    <button
                      type="button"
                      onClick={() => {
                        const sampleUrl = 'https://archive.org/details/BigBuckBunny_124';
                        setUrl(sampleUrl);
                        handleAnalyze(sampleUrl);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#2e1d24] hover:bg-[#3d242f] text-emerald-300 border border-[#5c2b37] text-xs font-medium transition-colors cursor-pointer"
                    >
                      Test Open Media (Archive.org)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="w-full p-3.5 mb-4 rounded-xl bg-[#20181b] border border-[#402228] text-red-300 text-xs flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{analyzeError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAnalyzeError(null)}
                    className="text-[#9aa0a6] hover:text-white text-xs cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            )}

            {/* Download Launch Error Message */}
            {downloadError && (
              <div className="w-full p-3.5 mb-4 rounded-xl bg-[#20181b] border border-[#52252c] text-red-300 text-xs flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <div>
                    <p className="font-medium text-red-300">Download Failed</p>
                    <p className="text-[#d1d5db] text-[11px] mt-0.5">{downloadError}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDownloadError(null)}
                  className="text-[#9aa0a6] hover:text-white text-xs cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Active Download Progress Card */}
            {activeJob && (
              <div className="mb-5">
                <DownloadProgressCard
                  job={activeJob}
                  onCancel={handleCancelDownload}
                  onRetry={() => {
                    if (metadata && metadata.formats[0]) {
                      handleStartDownload(metadata.formats[0]);
                    }
                  }}
                  onSaveFile={handleSaveFileToBrowser}
                />
              </div>
            )}

            {/* Analyzed Media Details & Quality Options */}
            {metadata && (
              <div className="mb-6">
                <MediaPreviewCard
                  metadata={metadata}
                  onStartDownload={handleStartDownload}
                  isStarting={isStartingDownload}
                  selectedFormatId={selectedFormatId}
                  onSelectFormat={setSelectedFormatId}
                />
              </div>
            )}
          </>
        ) : (
          /* History View */
          <HistorySection
            history={history}
            onRefreshHistory={fetchHistory}
            onDeleteHistoryItem={handleDeleteHistory}
            onClearHistory={handleClearAllHistory}
            onAnalyzeUrl={(historyUrl) => {
              setUrl(historyUrl);
              setCurrentView('main');
              handleAnalyze(historyUrl);
            }}
            onSaveFile={handleSaveFileToBrowser}
            onBack={() => setCurrentView('main')}
          />
        )}
      </main>

      {/* Floating Action Buttons (FABs) in Bottom Right - matching Seal app */}
      {currentView === 'main' && (
        <div className="fixed bottom-6 right-6 sm:right-[max(1.5rem,calc((100vw-36rem)/2+1.5rem))] flex flex-col items-center gap-3 z-40 select-none">
          {/* Paste FAB */}
          <button
            type="button"
            onClick={handlePasteFab}
            className="w-14 h-14 rounded-2xl bg-[#344F87] hover:bg-[#3d5b99] active:bg-[#2b4273] text-white shadow-lg shadow-black/40 flex items-center justify-center transition-all transform active:scale-95 cursor-pointer relative"
            title="Paste video link"
            aria-label="Paste video link"
          >
            {pastedFeedback ? (
              <Check className="w-6 h-6 text-emerald-300" />
            ) : (
              <Clipboard className="w-6 h-6" />
            )}
          </button>

          {/* Download FAB */}
          <button
            type="button"
            onClick={handleDownloadFab}
            disabled={isAnalyzing || isStartingDownload}
            className="w-14 h-14 rounded-2xl bg-[#344F87] hover:bg-[#3d5b99] active:bg-[#2b4273] text-white shadow-lg shadow-black/40 flex items-center justify-center transition-all transform active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download video"
            aria-label="Download video"
          >
            {isAnalyzing || isStartingDownload ? (
              <Loader2 className="w-6 h-6 animate-spin text-white" />
            ) : (
              <Download className="w-6 h-6" />
            )}
          </button>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Queue Modal */}
      <QueueModal
        isOpen={isQueueOpen}
        onClose={() => setIsQueueOpen(false)}
        activeJob={activeJob}
        onCancel={handleCancelDownload}
        onRetry={() => {
          if (metadata && metadata.formats[0]) {
            handleStartDownload(metadata.formats[0]);
          }
        }}
        onSaveFile={handleSaveFileToBrowser}
      />
    </div>
  );
}
