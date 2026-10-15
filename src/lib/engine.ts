import { execSync, spawn } from 'child_process';
import fs from 'fs';
import { VideoFormatOption, VideoMetadata } from './types';

let cachedFfmpegPath: string | null = null;

/**
 * Automatically locates the FFmpeg binary on Windows or Linux.
 */
export function getFfmpegPath(): string {
  if (cachedFfmpegPath && fs.existsSync(/*turbopackIgnore: true*/ cachedFfmpegPath)) {
    return cachedFfmpegPath;
  }

  // 1. Check environment variable
  if (process.env.FFMPEG_PATH && fs.existsSync(/*turbopackIgnore: true*/ process.env.FFMPEG_PATH)) {
    cachedFfmpegPath = process.env.FFMPEG_PATH;
    return cachedFfmpegPath;
  }

  // 2. Discover via imageio-ffmpeg python package
  try {
    const pyOutput = execSync(
      'python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"',
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();

    if (pyOutput && fs.existsSync(pyOutput)) {
      cachedFfmpegPath = pyOutput;
      return cachedFfmpegPath;
    }
  } catch {
    // Continue to next fallback
  }

  // 3. Fallback to system PATH
  try {
    const whereOutput = execSync('where.exe ffmpeg', { encoding: 'utf-8', timeout: 3000 }).trim();
    const firstLine = whereOutput.split('\n')[0].trim();
    if (firstLine && fs.existsSync(firstLine)) {
      cachedFfmpegPath = firstLine;
      return cachedFfmpegPath;
    }
  } catch {
    // System fallback
  }

  // Fallback to "ffmpeg" string
  return 'ffmpeg';
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return 'Unknown size';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface RawYtDlpFormat {
  format_id: string;
  format_note?: string;
  ext: string;
  width?: number;
  height?: number;
  resolution?: string;
  fps?: number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  filesize_approx?: number;
  tbr?: number;
  vbr?: number;
  abr?: number;
  protocol?: string;
}

interface RawYtDlpOutput {
  id: string;
  title: string;
  description?: string;
  duration?: number;
  thumbnail?: string;
  uploader?: string;
  uploader_url?: string;
  view_count?: number;
  webpage_url?: string;
  original_url?: string;
  width?: number;
  height?: number;
  aspect_ratio?: number;
  license?: string;
  formats?: RawYtDlpFormat[];
}

/**
 * Extracts and maps video metadata and supported formats via yt-dlp.
 */
export async function extractMetadata(videoUrl: string): Promise<VideoMetadata> {
  const ffmpeg = getFfmpegPath();

  // Arguments for yt-dlp execution
  const args = [
    '-m',
    'yt_dlp',
    '--dump-json',
    '--no-playlist',
    '--no-warnings',
    '--js-runtimes',
    'node',
    '--remote-components',
    'ejs:github',
    '--ffmpeg-location',
    ffmpeg,
    videoUrl,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn('python', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutData += chunk.toString('utf-8');
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrData += chunk.toString('utf-8');
    });

    child.on('close', (code: number) => {
      if (code !== 0) {
        let errMessage = 'Failed to extract video information.';
        if (stderrData.includes('Private video')) {
          errMessage = 'This video is private and cannot be downloaded.';
        } else if (stderrData.includes('Video unavailable') || stderrData.includes('404')) {
          errMessage = 'The requested video was not found or is unavailable.';
        } else if (stderrData.includes('Sign in') || stderrData.includes('bot')) {
          errMessage = 'Platform requires login or has restricted automated access.';
        } else if (stderrData.includes('DRM')) {
          errMessage = 'This content is protected by DRM and cannot be downloaded.';
        } else if (stderrData.trim()) {
          const lines = stderrData.trim().split('\n');
          errMessage = lines[lines.length - 1].replace(/^ERROR:\s*/i, '');
        }
        return reject(new Error(errMessage));
      }

      try {
        const raw = JSON.parse(stdoutData.trim()) as RawYtDlpOutput;
        const metadata = processRawMetadata(raw, videoUrl);
        resolve(metadata);
      } catch (err: unknown) {
        reject(new Error(`Failed to parse media metadata: ${(err as Error).message}`));
      }
    });

    child.on('error', (err: Error) => {
      reject(new Error(`Failed to execute extraction engine: ${err.message}`));
    });
  });
}

function processRawMetadata(raw: RawYtDlpOutput, originalUrl: string): VideoMetadata {
  const duration = raw.duration || 0;
  const isVertical =
    Boolean(raw.height && raw.width && raw.height > raw.width) ||
    Boolean(raw.aspect_ratio && raw.aspect_ratio < 1) ||
    originalUrl.includes('/shorts/') ||
    originalUrl.includes('/reel/') ||
    originalUrl.includes('tiktok.com');

  const rawFormats = raw.formats || [];

  // Filter valid video and audio formats
  const parsedOptions: VideoFormatOption[] = [];

  // 1. Target standard resolution buckets
  const qualityTargets: Array<{
    label: VideoFormatOption['qualityLabel'];
    minHeight: number;
    name: string;
  }> = [
    { label: '4K', minHeight: 2160, name: '2160p (4K UHD)' },
    { label: '2K', minHeight: 1440, name: '1440p (2K QHD)' },
    { label: '1080p', minHeight: 1080, name: '1080p (Full HD)' },
    { label: '720p', minHeight: 720, name: '720p (HD)' },
    { label: '480p', minHeight: 480, name: '480p (SD)' },
    { label: '360p', minHeight: 360, name: '360p (Data Saver)' },
  ];

  // Best audio stream candidate
  const audioCandidates = rawFormats.filter(
    (f) => f.vcodec === 'none' && f.acodec !== 'none'
  );
  const bestAudio = audioCandidates.sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

  // Collect available video formats
  for (const target of qualityTargets) {
    // Find streams matching target height (allowing small variance or vertical inverted dimensions)
    const matchingStreams = rawFormats.filter((f) => {
      if (f.vcodec === 'none') return false;
      const h = f.height || 0;
      const w = f.width || 0;
      const effectiveHeight = isVertical ? Math.max(h, w) : h;

      if (target.label === '4K') {
        return (
          effectiveHeight >= 2160 ||
          w >= 3840 ||
          Boolean(f.format_note && (f.format_note.includes('2160p') || f.format_note.toLowerCase().includes('4k'))) ||
          Boolean(f.resolution && (f.resolution.includes('3840x') || f.resolution.includes('2160p')))
        );
      }
      if (target.label === '2K') {
        return (
          (effectiveHeight >= 1440 && effectiveHeight < 2160) ||
          (w >= 2560 && w < 3840) ||
          Boolean(f.format_note && (f.format_note.includes('1440p') || f.format_note.toLowerCase().includes('2k')))
        );
      }
      if (target.label === '1080p') {
        return (
          (effectiveHeight >= 1080 && effectiveHeight < 1440) ||
          (w >= 1920 && w < 2560) ||
          Boolean(f.format_note && (f.format_note.includes('1080p') || f.format_note.toLowerCase().includes('fhd')))
        );
      }
      if (target.label === '720p') {
        return (
          (effectiveHeight >= 720 && effectiveHeight < 1080) ||
          (w >= 1280 && w < 1920) ||
          Boolean(f.format_note && f.format_note.includes('720p'))
        );
      }
      if (target.label === '480p') return effectiveHeight >= 480 && effectiveHeight < 720;
      if (target.label === '360p') return effectiveHeight >= 360 && effectiveHeight < 480;
      return false;
    });

    if (matchingStreams.length > 0) {
      // Sort to find the highest bitrate/quality stream
      matchingStreams.sort((a, b) => (b.tbr || b.vbr || 0) - (a.tbr || a.vbr || 0));
      const best = matchingStreams[0];

      const hasAudio = best.acodec !== 'none';
      const requiresMerge = !hasAudio;

      // Construct robust format selector with audio merging fallback
      let formatId = best.format_id;
      if (requiresMerge) {
        if (target.label === '4K') {
          formatId = `${best.format_id}+140/${best.format_id}+ba/bestvideo[height>=2160]+bestaudio/bestvideo[width>=3840]+bestaudio`;
        } else if (target.label === '2K') {
          formatId = `${best.format_id}+140/${best.format_id}+ba/bestvideo[height>=1440]+bestaudio`;
        } else if (target.label === '1080p') {
          formatId = `${best.format_id}+140/${best.format_id}+ba/bestvideo[height>=1080]+bestaudio`;
        } else {
          formatId = `${best.format_id}+ba`;
        }
      }

      // Estimate total filesize
      let approxBytes = best.filesize || best.filesize_approx;
      if (!approxBytes && duration > 0 && best.tbr) {
        approxBytes = Math.round((best.tbr * 1024 * duration) / 8);
      }
      if (requiresMerge && bestAudio) {
        const audioBytes = bestAudio.filesize || bestAudio.filesize_approx || (bestAudio.abr ? Math.round((bestAudio.abr * 1024 * duration) / 8) : 0);
        approxBytes = (approxBytes || 0) + audioBytes;
      }

      parsedOptions.push({
        formatId,
        qualityLabel: target.label,
        resolution: target.name,
        ext: 'mp4',
        fps: best.fps,
        filesizeApprox: approxBytes || undefined,
        filesizeFormatted: formatBytes(approxBytes),
        hasAudio: true, // Audio will always be included (direct or merged via FFmpeg)
        requiresMerge,
        vcodec: best.vcodec,
        acodec: hasAudio ? best.acodec : bestAudio?.acodec || 'aac',
        width: best.width,
        height: best.height,
      });
    }
  }

  // 2. Add Audio-Only Option (MP3 / High Quality Audio)
  if (audioCandidates.length > 0) {
    const topAudio = audioCandidates[0];
    let audioBytes = topAudio.filesize || topAudio.filesize_approx;
    if (!audioBytes && duration > 0 && topAudio.abr) {
      audioBytes = Math.round((topAudio.abr * 1024 * duration) / 8);
    }

    parsedOptions.push({
      formatId: 'ba/b',
      qualityLabel: 'Audio Only',
      resolution: topAudio.abr ? `${Math.round(topAudio.abr)} kbps Audio` : 'High Quality Audio',
      ext: 'mp3',
      filesizeApprox: audioBytes || undefined,
      filesizeFormatted: formatBytes(audioBytes),
      hasAudio: true,
      requiresMerge: false,
      acodec: topAudio.acodec || 'mp3',
    });
  }

  // Fallback: If no bucketed video format matched, pick default best
  if (parsedOptions.length === 0 && rawFormats.length > 0) {
    parsedOptions.push({
      formatId: 'b',
      qualityLabel: '720p',
      resolution: 'Standard Best',
      ext: 'mp4',
      hasAudio: true,
      requiresMerge: true,
      filesizeFormatted: 'Calculated at download',
    });
  }

  return {
    id: raw.id,
    title: raw.title || 'Untitled Video',
    description: raw.description,
    thumbnail: raw.thumbnail,
    duration,
    durationFormatted: formatDuration(duration),
    uploader: raw.uploader || 'Unknown Author',
    uploaderUrl: raw.uploader_url,
    viewCount: raw.view_count,
    originalUrl,
    isVertical,
    aspectRatio: raw.aspect_ratio,
    license: raw.license,
    formats: parsedOptions,
  };
}
