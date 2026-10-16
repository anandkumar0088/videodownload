import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { VideoFormatOption, VideoMetadata } from './types';

let cachedPythonCmd: string | null = null;
let pythonChecked = false;

let cachedFfmpegPath: string | null = null;
let ffmpegChecked = false;

/**
 * Dynamically probes for a working Python binary in the environment.
 * Tests PYTHON_PATH, python3, python, and py without crashing.
 */
export function findPythonBinary(): string | null {
  if (pythonChecked) {
    return cachedPythonCmd;
  }
  pythonChecked = true;

  const candidates = [
    process.env.PYTHON_PATH,
    process.env.PYTHON_BIN,
    'python3',
    'python',
    'py',
  ].filter(Boolean) as string[];

  for (const cmd of candidates) {
    try {
      const out = execSync(`${cmd} --version`, {
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 2500,
        encoding: 'utf-8',
      }).trim();

      if (out.toLowerCase().includes('python')) {
        cachedPythonCmd = cmd;
        console.log(`[MediaVault Engine] Detected Python executable: ${cmd} (${out})`);
        return cmd;
      }
    } catch {
      // Continue checking next candidate
    }
  }

  console.warn('[MediaVault Engine] No local Python executable found in environment.');
  cachedPythonCmd = null;
  return null;
}

/**
 * Automatically locates the FFmpeg binary on Windows or Linux without throwing.
 */
export function getFfmpegPath(): string | null {
  if (ffmpegChecked) {
    return cachedFfmpegPath;
  }
  ffmpegChecked = true;

  // 1. Check environment variable
  if (process.env.FFMPEG_PATH && fs.existsSync(/*turbopackIgnore: true*/ process.env.FFMPEG_PATH)) {
    cachedFfmpegPath = process.env.FFMPEG_PATH;
    return cachedFfmpegPath;
  }

  // 2. Discover via imageio-ffmpeg python package if Python is available
  const pythonCmd = findPythonBinary();
  if (pythonCmd) {
    try {
      const pyOutput = execSync(
        `${pythonCmd} -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"`,
        { encoding: 'utf-8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }
      ).trim();

      if (pyOutput && fs.existsSync(pyOutput)) {
        cachedFfmpegPath = pyOutput;
        return cachedFfmpegPath;
      }
    } catch {
      // Continue to next fallback
    }
  }

  // 3. Fallback to system PATH using platform-appropriate lookup
  try {
    const isWin = process.platform === 'win32';
    const checkCmd = isWin ? 'where.exe ffmpeg' : 'which ffmpeg';
    const whereOutput = execSync(checkCmd, { encoding: 'utf-8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const firstLine = whereOutput.split(/\r?\n/)[0].trim();
    if (firstLine && fs.existsSync(firstLine)) {
      cachedFfmpegPath = firstLine;
      return cachedFfmpegPath;
    }
  } catch {
    // Continue to next check
  }

  // 4. Test if 'ffmpeg' command executes directly
  try {
    execSync('ffmpeg -version', { stdio: 'ignore', timeout: 2500 });
    cachedFfmpegPath = 'ffmpeg';
    return cachedFfmpegPath;
  } catch {
    // FFmpeg is not installed
  }

  cachedFfmpegPath = null;
  return null;
}

/**
 * Checks if local server downloading and multiplexing is possible.
 */
export function isDownloadEngineAvailable(): boolean {
  return findPythonBinary() !== null;
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

function parseYtDlpError(stderrData: string): string {
  if (stderrData.includes('DRM')) {
    return 'This content is protected by DRM and cannot be downloaded.';
  }
  if (stderrData.includes('Private video')) {
    return 'This video is private and cannot be downloaded.';
  }
  if (stderrData.includes('Video unavailable') || stderrData.includes('404')) {
    return 'The requested video was not found or is unavailable.';
  }
  if (stderrData.includes('Sign in') || stderrData.includes('bot')) {
    return 'Platform requires login or has restricted automated access.';
  }
  if (stderrData.trim()) {
    const lines = stderrData.trim().split(/\r?\n/);
    const lastLine = lines[lines.length - 1];
    return lastLine.replace(/^ERROR:\s*/i, '');
  }
  return 'Failed to extract video information.';
}

/**
 * Extracts and maps video metadata.
 * Uses local Python engine if available, or delegates to Vercel Python Function (/api/extract).
 */
export async function extractMetadata(
  videoUrl: string,
  incomingHeaders?: Headers | Record<string, string | null | undefined> | string
): Promise<VideoMetadata> {
  const pythonCmd = findPythonBinary();

  // Mode 1: Local execution via detected Python executable
  if (pythonCmd) {
    const extractScript = path.resolve(process.cwd(), 'api', 'extract.py');
    const ffmpeg = getFfmpegPath();
    const args: string[] = [];

    if (fs.existsSync(extractScript)) {
      args.push(extractScript, videoUrl);
    } else {
      args.push(
        '-m',
        'yt_dlp',
        '--dump-json',
        '--no-playlist',
        '--no-warnings',
        '--extractor-args',
        'youtube:player_client=android,ios,web_embedded,mweb'
      );
      if (ffmpeg) {
        args.push('--ffmpeg-location', ffmpeg);
      }
      args.push(videoUrl);
    }

    return new Promise((resolve, reject) => {
      const child = spawn(/*turbopackIgnore: true*/ pythonCmd, args, {
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
          const errMessage = parseYtDlpError(stderrData);
          console.error('[MediaVault Engine] Extraction failed:', errMessage);
          return reject(new Error(errMessage));
        }

        try {
          const parsed = JSON.parse(stdoutData.trim());
          if (parsed.formats && Array.isArray(parsed.formats)) {
            // Already structured by api/extract.py
            return resolve(parsed as VideoMetadata);
          }
          // Raw yt-dlp json format
          const metadata = processRawMetadata(parsed as RawYtDlpOutput, videoUrl);
          resolve(metadata);
        } catch (err: unknown) {
          reject(new Error(`Failed to parse media metadata: ${(err as Error).message}`));
        }
      });

      child.on('error', (err: Error) => {
        console.error('[MediaVault Engine] Process spawn error:', err.message);
        reject(new Error(`Failed to execute extraction engine: ${err.message}`));
      });
    });
  }

  // Mode 2: Vercel Serverless environment - delegate to Python Function (/api/extract.py or /api/extract)
  let baseUrl = '';

  const getHeader = (name: string): string | null => {
    if (!incomingHeaders || typeof incomingHeaders === 'string') return null;
    if (typeof (incomingHeaders as Headers).get === 'function') {
      return (incomingHeaders as Headers).get(name);
    }
    const record = incomingHeaders as Record<string, string | null | undefined>;
    return record[name] || record[name.toLowerCase()] || null;
  };

  const xForwardedHost = getHeader('x-forwarded-host');
  const xForwardedProto = getHeader('x-forwarded-proto') || 'https';
  const reqHost = getHeader('host');

  if (xForwardedHost) {
    baseUrl = `${xForwardedProto}://${xForwardedHost}`;
  } else if (reqHost) {
    baseUrl = `${xForwardedProto}://${reqHost}`;
  } else if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    baseUrl = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  } else if (process.env.VERCEL_URL) {
    baseUrl = `https://${process.env.VERCEL_URL}`;
  } else if (typeof incomingHeaders === 'string' && incomingHeaders.startsWith('http')) {
    baseUrl = incomingHeaders;
  } else {
    baseUrl = 'http://localhost:3000';
  }

  baseUrl = baseUrl.replace(/\/+$/, '');

  const fetchHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const bypassHeader = getHeader('x-vercel-protection-bypass') || process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypassHeader) {
    fetchHeaders['x-vercel-protection-bypass'] = bypassHeader;
  }
  const cookieHeader = getHeader('cookie');
  if (cookieHeader) {
    fetchHeaders['cookie'] = cookieHeader;
  }
  const authHeader = getHeader('authorization');
  if (authHeader) {
    fetchHeaders['authorization'] = authHeader;
  }

  // Candidates: try direct Python function path first, then rewritten route
  const candidateEndpoints = [
    `${baseUrl}/api/extract.py`,
    `${baseUrl}/api/extract`,
  ];

  let lastError: Error | null = null;

  for (const endpoint of candidateEndpoints) {
    console.log(`[MediaVault Engine] Delegating extraction to Vercel Python runtime: ${endpoint}`);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify({ url: videoUrl }),
        signal: AbortSignal.timeout(55000),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        const snippet = text.slice(0, 160).replace(/\s+/g, ' ');
        throw new Error(`Endpoint returned non-JSON response (status ${res.status}): ${snippet}`);
      }

      const data = await res.json();
      if (data && data.success === false) {
        // The Python engine was reached and responded with a platform/extraction error
        throw new Error(data.error || 'Video extraction failed on the target platform.');
      }

      if (!res.ok) {
        throw new Error(`Python extraction function returned status ${res.status}`);
      }

      return data.data as VideoMetadata;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;
      // If the Python function was reached and returned an extraction/platform error,
      // rethrow immediately so the user sees the real message without an engine-unreachable wrapper
      if (
        msg.includes('restricted automated access') ||
        msg.includes('Platform requires login') ||
        msg.includes('DRM') ||
        msg.includes('private') ||
        msg.includes('unavailable') ||
        msg.includes('bot verification') ||
        msg.includes('Sign in') ||
        msg.includes('YT_COOKIES')
      ) {
        throw lastError;
      }
      console.warn(`[MediaVault Engine] Request to ${endpoint} failed: ${lastError.message}`);
    }
  }

  const errMsg = lastError ? lastError.message : 'No endpoint succeeded';
  console.error('[MediaVault Engine] All Python function endpoints failed:', errMsg);
  throw new Error(
    `Video extraction engine is unavailable. Neither local Python nor Vercel Python function was reachable (${errMsg}).`
  );
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
