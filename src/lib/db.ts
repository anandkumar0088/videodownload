import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { DownloadHistoryItem } from './types';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'mediavault.db');

let dbInstance: DatabaseSync | null = null;

export function getDatabase(): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

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
}

export function getAllHistory(): DownloadHistoryItem[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM downloads ORDER BY created_at DESC LIMIT 100
  `);
  const rows = stmt.all() as unknown as DownloadHistoryItem[];

  // Augment with file existence verification
  return rows.map((item) => ({
    ...item,
    fileExists: item.file_path ? fs.existsSync(item.file_path) : false,
  }));
}

export function deleteHistoryItem(id: string): boolean {
  const db = getDatabase();
  // Find record to clean file if exists
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
}

export function clearAllHistory(): boolean {
  const db = getDatabase();
  // Clean all files in temp_downloads
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
  return true;
}
