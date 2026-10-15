'use client';

import React from 'react';
import { X, Download, RotateCcw } from 'lucide-react';
import { DownloadJob } from '@/lib/types';

interface QueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeJob: DownloadJob | null;
  onCancel: (jobId: string) => void;
  onRetry: () => void;
  onSaveFile: (jobId: string) => void;
}

export const QueueModal: React.FC<QueueModalProps> = ({
  isOpen,
  onClose,
  activeJob,
  onCancel,
  onRetry,
  onSaveFile,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-[#1a1b21] border border-[#2e3039] rounded-2xl p-5 sm:p-6 text-[#f0f0f3] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#2e3039]">
          <h3 className="text-base font-normal text-white">Download queue</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-white hover:bg-[#22242c] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="mt-4">
          {activeJob ? (
            <div className="p-3.5 rounded-xl bg-[#22242c] border border-[#2e3039] flex flex-col gap-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-normal text-white truncate">{activeJob.title}</p>
                  <p className="text-[11px] text-[#9aa0a6]">
                    {activeJob.quality} · {activeJob.ext.toUpperCase()} · {activeJob.status}
                  </p>
                </div>
                <span className="text-xs font-mono text-white">
                  {activeJob.percent.toFixed(1)}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-[#111216] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#344F87] transition-all duration-200"
                  style={{ width: `${Math.max(2, activeJob.percent)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#9aa0a6]">
                <span>{activeJob.speed || '0 KB/s'}</span>
                <span>ETA {activeJob.eta || '--:--'}</span>
              </div>

              {/* Actions */}
              <div className="mt-1 flex justify-end gap-2">
                {(activeJob.status === 'downloading' || activeJob.status === 'merging') && (
                  <button
                    type="button"
                    onClick={() => onCancel(activeJob.jobId)}
                    className="px-2.5 py-1 rounded text-xs text-[#9aa0a6] hover:text-white transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
                {(activeJob.status === 'failed' || activeJob.status === 'cancelled') && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="px-2.5 py-1 rounded text-xs text-white bg-[#111216] flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Retry
                  </button>
                )}
                {activeJob.status === 'completed' && (
                  <button
                    type="button"
                    onClick={() => onSaveFile(activeJob.jobId)}
                    className="px-3 py-1 rounded-lg bg-[#344F87] text-white text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    Save file
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-[#9aa0a6]">
              No active downloads in queue
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#22242c] hover:bg-[#2b2d38] text-white text-xs font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
