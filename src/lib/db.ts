import fs from 'fs';
import path from 'path';
import { DownloadHistoryItem } from './types';

// On Vercel serverless functions, only /tmp is writable
const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'mediavault_data')
  : path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'mediavault.db');

// In-memory fallback if SQLite fails or filesystem is read-only
const inMemoryHistory: Map<string, DownloadHistoryItem> = new Map();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dbInstance: any = null;
let sqliteAvailable = true;

export function getDatabase() {
  if (dbInstance) {
    return dbInstance;
  }
  if (!sqliteAvailable) {
    return null;
  }

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Dynamic import/require of node:sqlite
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite');
    dbInstance = new DatabaseSync(DB_PATH);

    // Initialize schema
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS downloads (
        id TEXT PRIMARY KEY,
        job_id TEXT UNIQUE NOT NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        uploader TEXT,
        duration TEXT,
        thumbnail TEXT,
        quality TEXT,
        format TEXT,
        filesize INTEGER,
        status TEXT NOT NULL,
        error_message TEXT,
        file_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_downloads_job_id ON downloads(job_id);
      CREATE INDEX IF NOT EXISTS idx_downloads_created_at ON downloads(created_at DESC);
    `);

    return dbInstance;
  } catch (err) {
    console.warn('[MediaVault DB] SQLite not available in this environment. Using in-memory store:', (err as Error).message);
    sqliteAvailable = false;
    dbInstance = null;
    return null;
  }
}

export function saveDownloadRecord(record: {
  id: string;
  jobId: string;
  url: string;
  title: string;
  uploader?: string;
  duration?: string;
  thumbnail?: string;
  quality?: string;
  format?: string;
  filesize?: number;
  status: string;
  errorMessage?: string;
  filePath?: string;
}): void {
  const db = getDatabase();
  if (db) {
    try {
      const stmt = db.prepare(`
        INSERT INTO downloads (
          id, job_id, url, title, uploader, duration, thumbnail, quality, format, filesize, status, error_message, file_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(job_id) DO UPDATE SET
          status = excluded.status,
          filesize = excluded.filesize,
          error_message = excluded.error_message,
          file_path = excluded.file_path
      `);

      stmt.run(
        record.id,
        record.jobId,
        record.url,
        record.title,
        record.uploader || null,
        record.duration || null,
        record.thumbnail || null,
        record.quality || null,
        record.format || null,
        record.filesize || 0,
        record.status,
        record.errorMessage || null,
        record.filePath || null
      );
      return;
    } catch (dbErr) {
      console.warn('[MediaVault DB] saveDownloadRecord SQLite error, falling back to memory:', (dbErr as Error).message);
    }
  }

  // Fallback in-memory
  inMemoryHistory.set(record.jobId, {
    id: record.id,
    job_id: record.jobId,
    url: record.url,
    title: record.title,
    uploader: record.uploader,
    duration: record.duration,
    thumbnail: record.thumbnail,
    quality: record.quality,
    format: record.format,
    filesize: record.filesize,
    status: record.status as DownloadHistoryItem['status'],
    error_message: record.errorMessage,
    file_path: record.filePath,
    created_at: new Date().toISOString(),
    fileExists: Boolean(record.filePath && fs.existsSync(record.filePath)),
  });
}

export function updateDownloadStatus(
  jobId: string,
  status: string,
  options?: {
    errorMessage?: string;
    filePath?: string;
    fileSize?: number;
  }
): void {
  const db = getDatabase();
  if (db) {
    try {
      const stmt = db.prepare(`
        UPDATE downloads
        SET status = ?,
            error_message = COALESCE(?, error_message),
            file_path = COALESCE(?, file_path),
            filesize = COALESCE(?, filesize)
        WHERE job_id = ?
      `);

      stmt.run(
        status,
        options?.errorMessage || null,
        options?.filePath || null,
        options?.fileSize || null,
        jobId
      );
      return;
    } catch (dbErr) {
      console.warn('[MediaVault DB] updateDownloadStatus SQLite error:', (dbErr as Error).message);
    }
  }

  // Fallback in-memory
  const existing = inMemoryHistory.get(jobId);
  if (existing) {
    existing.status = status as DownloadHistoryItem['status'];
    if (options?.errorMessage) existing.error_message = options.errorMessage;
    if (options?.filePath) {
      existing.file_path = options.filePath;
      existing.fileExists = fs.existsSync(options.filePath);
    }
    if (options?.fileSize) existing.filesize = options.fileSize;
  }
}

export function getAllHistory(): DownloadHistoryItem[] {
  const db = getDatabase();
  if (db) {
    try {
      const stmt = db.prepare(`
        SELECT * FROM downloads ORDER BY created_at DESC LIMIT 100
      `);
      const rows = stmt.all() as unknown as DownloadHistoryItem[];

      return rows.map((item) => ({
        ...item,
        fileExists: item.file_path ? fs.existsSync(item.file_path) : false,
      }));
    } catch (dbErr) {
      console.warn('[MediaVault DB] getAllHistory SQLite error, returning in-memory:', (dbErr as Error).message);
    }
  }

  return Array.from(inMemoryHistory.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function deleteHistoryItem(id: string): boolean {
  const db = getDatabase();
  if (db) {
    try {
      const getStmt = db.prepare(`SELECT file_path FROM downloads WHERE id = ?`);
      const row = getStmt.get(id) as { file_path?: string } | undefined;

      if (row?.file_path && fs.existsSync(row.file_path)) {
        try {
          fs.unlinkSync(row.file_path);
        } catch {
          // Ignore cleanup error
        }
      }

      const stmt = db.prepare(`DELETE FROM downloads WHERE id = ?`);
      const info = stmt.run(id);
      return (info as { changes?: number }).changes ? (info as { changes?: number }).changes! > 0 : true;
    } catch (dbErr) {
      console.warn('[MediaVault DB] deleteHistoryItem SQLite error:', (dbErr as Error).message);
    }
  }

  for (const [jobId, item] of inMemoryHistory.entries()) {
    if (item.id === id) {
      if (item.file_path && fs.existsSync(item.file_path)) {
        try {
          fs.unlinkSync(item.file_path);
        } catch {
          // Ignore
        }
      }
      inMemoryHistory.delete(jobId);
      return true;
    }
  }
  return true;
}

export function clearAllHistory(): boolean {
  const db = getDatabase();
  if (db) {
    try {
      const stmt = db.prepare(`SELECT file_path FROM downloads`);
      const rows = stmt.all() as { file_path?: string }[];
      for (const row of rows) {
        if (row.file_path && fs.existsSync(row.file_path)) {
          try {
            fs.unlinkSync(row.file_path);
          } catch {
            // Ignore
          }
        }
      }

      db.exec(`DELETE FROM downloads`);
    } catch (dbErr) {
      console.warn('[MediaVault DB] clearAllHistory SQLite error:', (dbErr as Error).message);
    }
  }

  inMemoryHistory.clear();
  return true;
}
