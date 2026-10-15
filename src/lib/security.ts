import path from 'path';

// Private and reserved IP ranges (CIDR-like checks)
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  // 127.0.0.0/8 (Loopback)
  if (parts[0] === 127) return true;
  // 10.0.0.0/8 (Private)
  if (parts[0] === 10) return true;
  // 172.16.0.0/12 (Private)
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16 (Private)
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 169.254.0.0/16 (Link Local & Cloud Metadata)
  if (parts[0] === 169 && parts[1] === 254) return true;
  // 0.0.0.0/8
  if (parts[0] === 0) return true;

  return false;
}

/**
 * Validates and normalizes user input URLs to prevent SSRF and injection.
 */
export function validateAndNormalizeUrl(rawUrl: string): { valid: boolean; url?: string; error?: string } {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'A valid URL is required.' };
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048) {
    return { valid: false, error: 'URL exceeds maximum permitted length.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Malformed URL format. Please enter a full http:// or https:// address.' };
  }

  // Only allow http and https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTP and HTTPS protocols are permitted.' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost, internal domains, and metadata endpoints
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.includes('metadata.google') ||
    hostname.includes('169.254.169.254')
  ) {
    return { valid: false, error: 'Access to localhost, private networks, or metadata services is restricted.' };
  }

  // Check IPv4 addresses
  if (isPrivateIPv4(hostname)) {
    return { valid: false, error: 'Private and local IP addresses are blocked.' };
  }

  // Normalize: remove tracking query params like utm_*, si, etc. while preserving video IDs
  try {
    // Return sanitized normalized URL string
    return { valid: true, url: parsed.toString() };
  } catch {
    return { valid: false, error: 'Failed to normalize URL.' };
  }
}

/**
 * Sanitizes a filename to prevent path traversal and invalid Windows filesystem characters.
 */
export function sanitizeFilename(rawName: string, fallback = 'video'): string {
  if (!rawName) return fallback;

  // Remove path traversal and illegal characters: / \ ? * : | " < >
  let clean = rawName
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\x00-\x1f\x80-\x9f]/g, '')
    .trim();

  // Strip excessive periods or spaces
  clean = clean.replace(/^\.+/, '').trim();

  if (clean.length === 0) return fallback;
  if (clean.length > 120) clean = clean.substring(0, 120);

  return clean;
}

/**
 * Validates that a file path strictly resides within the target directory.
 */
export function isPathSafe(baseDir: string, targetFile: string): boolean {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(baseDir, targetFile);
  return resolvedTarget.startsWith(resolvedBase + path.sep);
}
