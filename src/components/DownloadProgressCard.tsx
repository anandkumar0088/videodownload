'use client';

import React, { useEffect, useRef } from 'react';
import { Download, RotateCcw, CheckCircle2, AlertCircle } from 'lucide-react';
import { DownloadJob } from '@/lib/types';

interface DownloadProgressCardProps {
  job: DownloadJob;
  onCancel: (jobId: string) => void;
  onRetry: () => void;
  onSaveFile: (jobId: string) => void;
}

export const DownloadProgressCard: React.FC<DownloadProgressCardProps> = ({
  job,
  onCancel,
  onRetry,
  onSaveFile,
}) => {
  const autoSavedRef = useRef<boolean>(false);

  useEffect(() => {
    if (job.status === 'completed' && !autoSavedRef.current) {
      autoSavedRef.current = true;
      onSaveFile(job.jobId);
    }
  }, [job.status, job.jobId, onSaveFile]);

  const isDownloading = job.status === 'downloading' || job.status === 'queued';
  const isMerging = job.status === 'merging';
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const isCancelled = job.status === 'cancelled';

  const formatSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="w-full bg-[#1a1b21] border border-[#2e3039] rounded-2xl p-4 sm:p-5 text-[#f0f0f3]">
      {/* Title & Quality */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-normal text-white truncate max-w-lg">
            {job.title}
          </h4>
          <div className="flex items-center gap-2 text-xs text-[#9aa0a6] mt-0.5">
            <span>{job.quality}</span>
            <span>·</span>
            <span className="uppercase font-mono">{job.ext}</span>
            {job.fileSize && (
              <>
                <span>·</span>
                <span>{formatSize(job.fileSize)}</span>
              </>
            )}
          </div>
        </div>

        {/* State Tag */}
        <div className="shrink-0 text-xs">
          {isDownloading && <span className="text-[#9aa0a6]">Downloading</span>}
          {isMerging && <span className="text-[#9aa0a6]">Merging (FFmpeg)</span>}
          {isCompleted && (
            <span className="text-emerald-400 flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Completed
            </span>
          )}
          {isFailed && (
            <span className="text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              Failed
            </span>
          )}
          {isCancelled && <span className="text-[#9aa0a6]">Cancelled</span>}
        </div>
      </div>

      {/* Thin Material Linear Progress Bar */}
      <div className="mt-4">
        <div className="w-full h-1.5 bg-[#22242c] rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-200 ${
              isCompleted
                ? 'bg-emerald-500'
                : isFailed || isCancelled
                ? 'bg-red-500'
                : 'bg-[#344F87]'
            }`}
            style={{ width: `${isCompleted ? 100 : Math.max(2, job.percent)}%` }}
          />
        </div>

        {/* Progress Telemetry */}
        <div className="flex items-center justify-between text-xs text-[#9aa0a6] mt-2">
          <span>
            {isCompleted
              ? 'Ready to save'
              : isMerging
              ? 'Muxing audio & video streams...'
              : isFailed
              ? (job.errorMessage || 'Failed')
              : `${job.speed || '0 KB/s'} · ETA ${job.eta || '--:--'}`}
          </span>
          <span className="font-mono text-white font-medium">
            {isCompleted ? '100%' : `${job.percent.toFixed(1)}%`}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-4 pt-3 border-t border-[#2e3039] flex items-center justify-between">
        <span className="text-xs text-[#9aa0a6] font-mono">
          {job.downloadedBytes > 0
            ? `${formatSize(job.downloadedBytes)}${
                job.totalBytes > 0 ? ` / ${formatSize(job.totalBytes)}` : ''
              }`
            : ''}
        </span>

        <div className="flex items-center gap-2">
          {(isDownloading || isMerging) && (
            <button
              type="button"
              onClick={() => onCancel(job.jobId)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#9aa0a6] hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}

          {(isFailed || isCancelled) && (
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#22242c] hover:bg-[#2b2d38] text-white transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          )}

          {isCompleted && (
            <button
              type="button"
              onClick={() => onSaveFile(job.jobId)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#344F87] hover:bg-[#3d5b99] text-white text-xs font-medium transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save file</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
