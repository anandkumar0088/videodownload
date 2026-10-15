export interface VideoFormatOption {
  formatId: string;
  qualityLabel: '4K' | '2K' | '1080p' | '720p' | '480p' | '360p' | 'Audio Only';
  resolution: string;
  ext: 'mp4' | 'webm' | 'mp3' | 'm4a';
  fps?: number;
  filesizeApprox?: number;
  filesizeFormatted?: string;
  hasAudio: boolean;
  requiresMerge: boolean;
  vcodec?: string;
  acodec?: string;
  width?: number;
  height?: number;
}

export interface VideoMetadata {
  id: string;
  title: string;
  description?: string;
  thumbnail?: string;
  duration: number; // in seconds
  durationFormatted: string;
  uploader?: string;
  uploaderUrl?: string;
  viewCount?: number;
  originalUrl: string;
  isVertical: boolean;
  aspectRatio?: number;
  license?: string;
  formats: VideoFormatOption[];
}

export type JobStatus =
  | 'queued'
  | 'downloading'
  | 'merging'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface DownloadJob {
  jobId: string;
  url: string;
  title: string;
  thumbnail?: string;
  formatId: string;
  ext: string;
  quality: string;
  status: JobStatus;
  percent: number;
  speed: string;
  eta: string;
  downloadedBytes: number;
  totalBytes: number;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface DownloadHistoryItem {
  id: string;
  job_id: string;
  url: string;
  title: string;
  uploader?: string;
  duration?: string;
  thumbnail?: string;
  quality?: string;
  format?: string;
  filesize?: number;
  status: string;
  error_message?: string;
  file_path?: string;
  created_at: string;
  fileExists?: boolean;
}

export interface AnalyzeResponse {
  success: boolean;
  data?: VideoMetadata;
  error?: string;
}

export interface StartDownloadResponse {
  success: boolean;
  jobId?: string;
  error?: string;
}
