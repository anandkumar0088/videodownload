'use client';

import React from 'react';
import { X, CheckCircle2, Shield, HardDrive, Info } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-[#1a1b21] border border-[#2e3039] rounded-2xl p-5 sm:p-6 text-[#f0f0f3] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#2e3039]">
          <h3 className="text-base font-normal text-white">Settings</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#9aa0a6] hover:text-white hover:bg-[#22242c] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="mt-4 flex flex-col gap-3 text-sm">
          {/* Engine status item */}
          <div className="p-3 rounded-xl bg-[#22242c] border border-[#2e3039] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <div>
                <p className="font-normal text-white text-xs">FFmpeg 7.1 & yt-dlp</p>
                <p className="text-[11px] text-[#9aa0a6]">Lossless stream muxing ready</p>
              </div>
            </div>
            <span className="text-[11px] text-emerald-400 font-mono">Active</span>
          </div>

          {/* Database status */}
          <div className="p-3 rounded-xl bg-[#22242c] border border-[#2e3039] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <HardDrive className="w-4 h-4 text-[#7e9fd6]" />
              <div>
                <p className="font-normal text-white text-xs">Local SQLite Database</p>
                <p className="text-[11px] text-[#9aa0a6]">Stored in data/mediavault.db</p>
              </div>
            </div>
            <span className="text-[11px] text-zinc-300 font-mono">Connected</span>
          </div>

          {/* Security status */}
          <div className="p-3 rounded-xl bg-[#22242c] border border-[#2e3039] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-[#7e9fd6]" />
              <div>
                <p className="font-normal text-white text-xs">SSRF & Path Traversal Guard</p>
                <p className="text-[11px] text-[#9aa0a6]">Private IP and localhost protection</p>
              </div>
            </div>
            <span className="text-[11px] text-emerald-400 font-mono">Enforced</span>
          </div>

          {/* Legal note */}
          <div className="mt-2 p-3 rounded-xl bg-[#111216] border border-[#2e3039] text-xs text-[#9aa0a6] flex items-start gap-2 leading-relaxed">
            <Info className="w-4 h-4 text-[#7e9fd6] shrink-0 mt-0.5" />
            <p>
              Download only content you own, have permission to download, or which is licensed under Creative Commons or Public Domain.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#344F87] hover:bg-[#3d5b99] text-white text-xs font-medium transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
