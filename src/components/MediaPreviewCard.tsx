'use client';

import React, { useState } from 'react';
import {
  Download,
  Clock,
  User,
  Check,
  CheckCircle2,
  Film,
  Smartphone,
} from 'lucide-react';
import { VideoMetadata, VideoFormatOption } from '@/lib/types';

interface MediaPreviewCardProps {
  metadata: VideoMetadata;
  onStartDownload: (format: VideoFormatOption) => void;
  isStarting: boolean;
  selectedFormatId?: string;
  onSelectFormat?: (formatId: string) => void;
}

export const MediaPreviewCard: React.FC<MediaPreviewCardProps> = ({
  metadata,
  onStartDownload,
  isStarting,
  selectedFormatId: controlledFormatId,
  onSelectFormat,
}) => {
  const [internalFormatId, setInternalFormatId] = useState<string>(
    metadata.formats[0]?.formatId || ''
  );

  const selectedFormatId = controlledFormatId ?? internalFormatId;
  const handleSelectFormat = (formatId: string) => {
    if (onSelectFormat) {
      onSelectFormat(formatId);
    } else {
      setInternalFormatId(formatId);
    }
  };

  const selectedFormat =
    metadata.formats.find((f) => f.formatId === selectedFormatId) ||
    metadata.formats[0];

  const getQualityDisplayName = (label: string) => {
    if (label === '4K') return '2160p (4K)';
    if (label === '2K') return '1440p';
    if (label === 'Audio Only') return 'Audio (MP3)';
    return label;
  };

  return (
    <div className="w-full bg-[#1a1b21] border border-[#2e3039] rounded-2xl p-4 sm:p-5 text-[#f0f0f3]">
      {/* Media Details Row */}
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        {/* Thumbnail */}
        <div className="relative w-full sm:w-44 aspect-video rounded-xl overflow-hidden bg-[#111216] border border-[#2e3039] shrink-0">
          {metadata.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={metadata.thumbnail}
              alt={metadata.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#9aa0a6]">
              <Film className="w-8 h-8" />
            </div>
          )}

          {/* Duration Badge */}
          {metadata.durationFormatted && (
            <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[11px] font-mono font-medium text-[#f0f0f3]">
              {metadata.durationFormatted}
            </div>
          )}

          {/* Vertical Short Badge */}
          {metadata.isVertical && (
            <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-[#344F87] text-[10px] font-medium text-white flex items-center gap-1">
              <Smartphone className="w-3 h-3" />
              <span>9:16</span>
            </div>
          )}
        </div>

        {/* Title and metadata */}
        <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
          <div>
            <h3 className="text-base font-normal text-white line-clamp-2 leading-snug">
              {metadata.title}
            </h3>

            <div className="flex items-center gap-3 text-xs text-[#9aa0a6] mt-1.5">
              {metadata.uploader && (
                <div className="flex items-center gap-1 truncate">
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{metadata.uploader}</span>
                </div>
              )}
              {metadata.durationFormatted && (
                <div className="flex items-center gap-1 shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{metadata.durationFormatted}</span>
                </div>
              )}
            </div>
          </div>

          {/* Audio included status indicator */}
          <div className="mt-3 flex items-center gap-1.5 text-xs text-[#9aa0a6]">
            <Check className="w-3.5 h-3.5 text-[#7e9fd6]" />
            <span>
              {selectedFormat?.qualityLabel === 'Audio Only'
                ? 'Audio stream (MP3)'
                : 'Audio included (merged via FFmpeg)'}
            </span>
          </div>
        </div>
      </div>

      {/* Quality Selection Section */}
      <div className="mt-5 pt-4 border-t border-[#2e3039]">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-medium text-[#9aa0a6]">Available resolutions</span>
          {selectedFormat?.filesizeFormatted && (
            <span className="text-xs text-[#9aa0a6] font-mono">
              Estimated size: {selectedFormat.filesizeFormatted}
            </span>
          )}
        </div>

        {/* Quality Options Pills */}
        <div className="flex flex-wrap gap-2">
          {metadata.formats.map((fmt) => {
            const isSelected = fmt.formatId === selectedFormat?.formatId;
            return (
              <button
                key={fmt.formatId}
                type="button"
                onClick={() => handleSelectFormat(fmt.formatId)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer border ${
                  isSelected
                    ? 'bg-[#344F87] text-white border-transparent'
                    : 'bg-[#22242c] text-[#9aa0a6] hover:text-[#f0f0f3] border-[#2e3039]'
                }`}
              >
                <span>{getQualityDisplayName(fmt.qualityLabel)}</span>
                <span className="text-[10px] uppercase opacity-75 font-mono">{fmt.ext}</span>
                {isSelected && <CheckCircle2 className="w-3 h-3 ml-0.5" />}
              </button>
            );
          })}
        </div>

        {/* Action Button */}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => selectedFormat && onStartDownload(selectedFormat)}
            disabled={isStarting || !selectedFormat}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#344F87] hover:bg-[#3d5b99] active:bg-[#2b4273] text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>
              {isStarting
                ? 'Preparing...'
                : `Download ${selectedFormat?.qualityLabel || ''}`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
