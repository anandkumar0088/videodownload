'use client';

import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, Shield, HardDrive, Info, Server, AlertCircle, RefreshCw } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface HealthData {
  success: boolean;
  engines?: {
    downloadWorker?: {
      backendUrlConfigured: boolean;
      status: string;
      mode: string;
      description: string;
    };
    ffmpeg?: {
      available: boolean;
      path: string | null;
    };
    localPython?: {
      available: boolean;
    };
  };
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);

  const checkHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealth(data);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkHealth();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const worker = health?.engines?.downloadWorker;
  const isWorkerHealthy = worker?.status === 'healthy';
  const isWorkerConfigured = worker?.backendUrlConfigured;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-[#1a1b21] border border-[#2e3039] rounded-2xl p-5 sm:p-6 text-[#f0f0f3] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#2e3039]">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-normal text-white">System Status & Settings</h3>
            <button
              type="button"
              onClick={checkHealth}
              disabled={loading}
              className="text-[#9aa0a6] hover:text-white transition-colors cursor-pointer p-1"
              title="Refresh health check"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
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
          {/* Dedicated Backend Worker Status */}
          <div className="p-3 rounded-xl bg-[#22242c] border border-[#2e3039] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Server className={`w-4 h-4 ${isWorkerHealthy ? 'text-emerald-400' : isWorkerConfigured ? 'text-red-400' : 'text-amber-400'}`} />
              <div>
                <p className="font-normal text-white text-xs">Dedicated Backend Worker</p>
                <p className="text-[11px] text-[#9aa0a6]">
                  {isWorkerHealthy
                    ? 'Connected (FastAPI + FFmpeg worker)'
                    : isWorkerConfigured
                    ? `Worker unreachable (${worker?.status})`
                    : 'Configure MEDIAVAULT_BACKEND_URL'}
                </p>
              </div>
            </div>
            <span
              className={`text-[11px] font-mono ${
                isWorkerHealthy
                  ? 'text-emerald-400'
                  : isWorkerConfigured
                  ? 'text-red-400'
                  : 'text-amber-400'
              }`}
            >
              {isWorkerHealthy ? 'Connected' : isWorkerConfigured ? 'Offline' : 'Unset'}
            </span>
          </div>

          {/* Stream Muxing & FFmpeg */}
          <div className="p-3 rounded-xl bg-[#22242c] border border-[#2e3039] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <div>
                <p className="font-normal text-white text-xs">FFmpeg Stream Multiplexing</p>
                <p className="text-[11px] text-[#9aa0a6]">DASH video + audio lossless muxing</p>
              </div>
            </div>
            <span className="text-[11px] text-emerald-400 font-mono">
              {isWorkerHealthy || health?.engines?.ffmpeg?.available ? 'Ready' : 'Worker-backed'}
            </span>
          </div>

          {/* Database status */}
          <div className="p-3 rounded-xl bg-[#22242c] border border-[#2e3039] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <HardDrive className="w-4 h-4 text-[#7e9fd6]" />
              <div>
                <p className="font-normal text-white text-xs">MediaVault Storage</p>
                <p className="text-[11px] text-[#9aa0a6]">Download history and session logs</p>
              </div>
            </div>
            <span className="text-[11px] text-zinc-300 font-mono">Active</span>
          </div>

          {/* Security status */}
          <div className="p-3 rounded-xl bg-[#22242c] border border-[#2e3039] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-[#7e9fd6]" />
              <div>
                <p className="font-normal text-white text-xs">SSRF & Injection Guard</p>
                <p className="text-[11px] text-[#9aa0a6]">Private IP, cloud metadata & path protection</p>
              </div>
            </div>
            <span className="text-[11px] text-emerald-400 font-mono">Enforced</span>
          </div>

          {/* Backend Info banner if not configured */}
          {!isWorkerConfigured && (
            <div className="p-3 rounded-xl bg-[#1c1a17] border border-[#3b3225] text-xs text-[#d1d5db] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-300 font-medium">To enable server-side downloads on Vercel:</p>
                <p className="text-[11px] text-[#9ca3af] mt-0.5 leading-relaxed">
                  Deploy the Python worker in <code className="text-[#f0f0f3]">backend/</code> to Render or Railway and set <code className="text-[#f0f0f3]">MEDIAVAULT_BACKEND_URL</code> in Vercel.
                </p>
              </div>
            </div>
          )}

          {/* Legal note */}
          <div className="p-3 rounded-xl bg-[#111216] border border-[#2e3039] text-xs text-[#9aa0a6] flex items-start gap-2 leading-relaxed">
            <Info className="w-4 h-4 text-[#7e9fd6] shrink-0 mt-0.5" />
            <p>
              Download only media you have authorization to download or that is licensed under Creative Commons or Public Domain.
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
