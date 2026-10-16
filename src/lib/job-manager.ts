import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { DownloadJob } from './types';
import { getFfmpegPath, findPythonBinary } from './engine';
import { sanitizeFilename } from './security';
import { saveDownloadRecord, updateDownloadStatus } from './db';

const TEMP_DIR = path.resolve(process.cwd(), 'temp_downloads');

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

class JobManager {
  private jobs: Map<string, DownloadJob> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private subscribers: Map<string, Set<(job: DownloadJob) => void>> = new Map();

  constructor() {
    // Periodic cleanup of temp files older than 2 hours
    setInterval(() => this.cleanupOldFiles(), 30 * 60 * 1000);
  }

  public createJob(params: {
    url: string;
    title: string;
    thumbnail?: string;
    formatId: string;
    ext: string;
    quality: string;
    uploader?: string;
    duration?: string;
  }): DownloadJob {
    const jobId = randomUUID();
    const cleanTitle = sanitizeFilename(params.title);

    const job: DownloadJob = {
      jobId,
      url: params.url,
      title: params.title,
      thumbnail: params.thumbnail,
      formatId: params.formatId,
      ext: params.ext,
      quality: params.quality,
      status: 'queued',
      percent: 0,
      speed: '0 KB/s',
      eta: '--:--',
      downloadedBytes: 0,
      totalBytes: 0,
      createdAt: new Date().toISOString(),
    };

    this.jobs.set(jobId, job);

    // Persist initial record in SQLite
    saveDownloadRecord({
      id: randomUUID(),
      jobId,
      url: params.url,
      title: params.title,
      uploader: params.uploader,
      duration: params.duration,
      thumbnail: params.thumbnail,
      quality: params.quality,
      format: params.ext,
      status: 'queued',
    });

    // Start processing in background
    this.startDownload(jobId, cleanTitle);

    return job;
  }

  public getJob(jobId: string): DownloadJob | undefined {
    return this.jobs.get(jobId);
  }

  public subscribe(jobId: string, listener: (job: DownloadJob) => void): () => void {
    if (!this.subscribers.has(jobId)) {
      this.subscribers.set(jobId, new Set());
    }
    this.subscribers.get(jobId)!.add(listener);

    // Immediately push current state
    const current = this.jobs.get(jobId);
    if (current) {
      listener(current);
    }

    return () => {
      const set = this.subscribers.get(jobId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.subscribers.delete(jobId);
        }
      }
    };
  }

  private notify(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const set = this.subscribers.get(jobId);
    if (set) {
      for (const listener of set) {
        try {
          listener({ ...job });
        } catch {
          // Ignore listener failures
        }
      }
    }
  }

  private startDownload(jobId: string, cleanTitle: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const pythonCmd = findPythonBinary();
    if (!pythonCmd) {
      job.status = 'failed';
      job.errorMessage =
        'Download engine is unavailable: Python was not found in this environment. Video analysis is available via Vercel Python runtime, but local downloading requires Python on the host.';
      console.error(`[MediaVault Download] Job ${jobId} failed: Python binary not found in environment.`);
      updateDownloadStatus(jobId, 'failed', { errorMessage: job.errorMessage });
      this.notify(jobId);
      return;
    }

    const ffmpeg = getFfmpegPath();
    const outputTemplate = path.join(TEMP_DIR, `${jobId}_${cleanTitle.substring(0, 50)}.%(ext)s`);

    const args = [
      '-m',
      'yt_dlp',
      '--js-runtimes',
      'node',
      '--remote-components',
      'ejs:github',
      '--extractor-args',
      'youtube:player_client=web_embedded,android,web',
      '--no-playlist',
      '--no-warnings',
      '--newline',
      '--progress-template',
      'PROGRESS:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.status)s',
      '-o',
      outputTemplate,
    ];

    if (ffmpeg) {
      args.splice(2, 0, '--ffmpeg-location', ffmpeg);
    }

    if (job.ext === 'mp3') {
      const audioFormat = job.formatId && job.formatId !== 'ba/b'
        ? `${job.formatId}/ba/18/b`
        : 'ba/18/b';
      args.push('-f', audioFormat, '-x', '--audio-format', 'mp3', '--audio-quality', '0');
    } else {
      const videoFormat = job.formatId
        ? `${job.formatId}/18/bestvideo+bestaudio/best`
        : 'bestvideo+bestaudio/18/best';
      args.push('-f', videoFormat);
      args.push('--merge-output-format', job.ext || 'mp4');
    }

    args.push(job.url);

    job.status = 'downloading';
    this.notify(jobId);
    updateDownloadStatus(jobId, 'downloading');

    const child = spawn(pythonCmd, args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.processes.set(jobId, child);

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      const lines = text.split(/\r?\n/);

      for (const line of lines) {
        if (line.startsWith('PROGRESS:')) {
          const parts = line.replace('PROGRESS:', '').split('|');
          if (parts.length >= 6) {
            const percentStr = parts[0].replace('%', '').trim();
            const percent = parseFloat(percentStr);
            const speed = parts[1].trim() || job.speed;
            const eta = parts[2].trim() || job.eta;
            const downloaded = parseInt(parts[3], 10);
            const total = parseInt(parts[4], 10);

            if (!isNaN(percent)) job.percent = Math.min(100, Math.max(0, percent));
            job.speed = speed;
            job.eta = eta;
            if (!isNaN(downloaded) && downloaded > 0) job.downloadedBytes = downloaded;
            if (!isNaN(total) && total > 0) job.totalBytes = total;

            this.notify(jobId);
          }
        } else if (line.includes('[Merger]') || line.includes('[ExtractAudio]')) {
          job.status = 'merging';
          job.speed = 'Processing audio/video streams';
          job.eta = 'Finalizing';
          this.notify(jobId);
        }
      }
    });

    let stderrOutput = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderrOutput += chunk.toString('utf-8');
    });

    child.on('close', (code: number) => {
      this.processes.delete(jobId);

      if (job.status === 'cancelled') {
        this.cleanupJobFiles(jobId);
        return;
      }

      if (code === 0) {
        // Locate created file
        const candidateFiles = fs.readdirSync(TEMP_DIR).filter((f) => f.startsWith(jobId));
        const finalFile = candidateFiles.find((f) => !f.endsWith('.part') && !f.endsWith('.ytdl'));

        if (finalFile) {
          const finalPath = path.join(TEMP_DIR, finalFile);
          const stats = fs.statSync(finalPath);

          job.status = 'completed';
          job.percent = 100;
          job.filePath = finalPath;
          job.fileName = finalFile.replace(`${jobId}_`, '');
          job.fileSize = stats.size;
          job.completedAt = new Date().toISOString();

          updateDownloadStatus(jobId, 'completed', {
            filePath: finalPath,
            fileSize: stats.size,
          });

          this.notify(jobId);
          return;
        }
      }

      // Download failed
      job.status = 'failed';
      let errorMsg = 'Download failed or stream was interrupted.';
      if (stderrOutput.includes('HTTP Error 403')) {
        errorMsg = 'Media server rejected request (HTTP 403 Forbidden).';
      } else if (stderrOutput.includes('Video unavailable')) {
        errorMsg = 'Video is unavailable or has been removed.';
      } else if (stderrOutput.trim()) {
        const lines = stderrOutput.trim().split('\n');
        errorMsg = lines[lines.length - 1].replace(/^ERROR:\s*/i, '');
      }

      job.errorMessage = errorMsg;
      updateDownloadStatus(jobId, 'failed', { errorMessage: errorMsg });
      this.notify(jobId);
      this.cleanupJobFiles(jobId);
    });

    child.on('error', (err: Error) => {
      this.processes.delete(jobId);
      job.status = 'failed';
      job.errorMessage = `System process error: ${err.message}`;
      updateDownloadStatus(jobId, 'failed', { errorMessage: job.errorMessage });
      this.notify(jobId);
      this.cleanupJobFiles(jobId);
    });
  }

  public cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    const child = this.processes.get(jobId);

    if (job) {
      job.status = 'cancelled';
      job.errorMessage = 'Download was cancelled by user.';
      this.notify(jobId);
      updateDownloadStatus(jobId, 'cancelled', { errorMessage: 'Cancelled by user' });
    }

    if (child) {
      try {
        if (process.platform === 'win32' && child.pid) {
          execSync(`taskkill /pid ${child.pid} /T /F`);
        } else {
          child.kill('SIGKILL');
        }
      } catch {
        try {
          child.kill();
        } catch {
          // Ignore
        }
      }
      this.processes.delete(jobId);
    }

    this.cleanupJobFiles(jobId);
    return true;
  }

  private cleanupJobFiles(jobId: string): void {
    try {
      if (!fs.existsSync(TEMP_DIR)) return;
      const files = fs.readdirSync(TEMP_DIR).filter((f) => f.startsWith(jobId));
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(TEMP_DIR, file));
        } catch {
          // Ignore
        }
      }
    } catch {
      // Ignore
    }
  }

  private cleanupOldFiles(): void {
    try {
      if (!fs.existsSync(TEMP_DIR)) return;
      const files = fs.readdirSync(TEMP_DIR);
      const now = Date.now();
      const twoHoursMs = 2 * 60 * 60 * 1000;

      for (const file of files) {
        const fullPath = path.join(TEMP_DIR, file);
        try {
          const stats = fs.statSync(fullPath);
          if (now - stats.mtimeMs > twoHoursMs) {
            fs.unlinkSync(fullPath);
          }
        } catch {
          // Ignore
        }
      }
    } catch {
      // Ignore
    }
  }
}

// Global singleton instance
const globalForJobManager = global as unknown as { jobManager?: JobManager };
export const jobManager = globalForJobManager.jobManager ?? new JobManager();
if (process.env.NODE_ENV !== 'production') globalForJobManager.jobManager = jobManager;
