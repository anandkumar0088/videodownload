'use client';

import React from 'react';
import { X, ShieldCheck, CheckCircle2, AlertTriangle, FileVideo, Cpu } from 'lucide-react';

interface PlatformGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PlatformGuideModal: React.FC<PlatformGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-[#11131c] border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Title */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">MediaVault User & Legal Guidelines</h2>
            <p className="text-xs text-zinc-400">Compliance, permitted sources, and engine specifications</p>
          </div>
        </div>

        {/* Content sections */}
        <div className="flex flex-col gap-6 text-xs text-zinc-300 leading-relaxed">
          {/* Section 1: Permitted Usage */}
          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Authorized & Permitted Media
            </h3>
            <p>
              MediaVault is engineered strictly for downloading media where you own the copyright, have
              explicit permission from the copyright owner, or where the content is released under an open
              license (such as <strong>Creative Commons</strong>, <strong>Public Domain</strong>, or <strong>Open Access</strong>).
            </p>
          </div>

          {/* Section 2: Platform Restrictions & DRM */}
          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Technical Limits & Restrictions
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-zinc-400">
              <li>MediaVault will <strong>never</strong> bypass digital rights management (DRM), encryption, or paywalls.</li>
              <li>Private, unlisted videos requiring account credentials, age-gated videos, or removed content will return clear informative error codes.</li>
              <li>Resolution badges (such as 4K UHD or 2K QHD) are only offered when verified as physically available on the source server.</li>
            </ul>
          </div>

          {/* Section 3: Architecture & FFmpeg Stream Merging */}
          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              Lossless FFmpeg Stream Merging
            </h3>
            <p>
              Modern media platforms store high-definition video (1080p, 1440p, 2160p 4K) separately from audio tracks (DASH/HLS streams).
              MediaVault automatically invokes its integrated <strong>FFmpeg 7.1 Muxer</strong> in the background to download both streams simultaneously and multiplex them into a single, fully playable MP4 or WebM file with zero transcoding loss.
            </p>
          </div>

          {/* Section 4: Vertical Shorts Support */}
          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileVideo className="w-4 h-4 text-purple-400" />
              Vertical Shorts & Reels (9:16)
            </h3>
            <p>
              Vertical media formats (YouTube Shorts, Instagram Reels, TikTok) are automatically detected via aspect ratio analysis (<code className="text-purple-300">height &gt; width</code>). MediaVault preserves the original 9:16 vertical orientation and mobile framerates.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="mt-6 pt-4 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold text-xs transition-colors"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
};
