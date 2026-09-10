/**
 * Utility functions for precise timestamp formatting, parsing, and duration calculations.
 */

export const MAX_CLIP_DURATION_SECONDS = 90.0;

/**
 * Formats seconds into MM:SS.mmm or HH:MM:SS.mmm
 */
export function formatTimestamp(seconds: number, includeHours: boolean = false): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);

  const pad2 = (n: number) => n.toString().padStart(2, '0');
  const pad3 = (n: number) => n.toString().padStart(3, '0');

  if (hrs > 0 || includeHours) {
    return `${pad2(hrs)}:${pad2(mins)}:${pad2(secs)}.${pad3(ms)}`;
  }
  return `${pad2(mins)}:${pad2(secs)}.${pad3(ms)}`;
}

/**
 * Formats seconds into clean short time display e.g. "1m 30s" or "45.5s"
 */
export function formatDurationHuman(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const remSecs = (seconds % 60).toFixed(1);
  return `${mins}m ${remSecs}s`;
}

/**
 * Parses timestamp string into seconds.
 * Supports:
 * - "01:23.500" -> 83.5
 * - "01:23:45.600" -> 5025.6
 * - "01:23" -> 83
 * - "45.5" -> 45.5
 */
export function parseTimestamp(str: string): number | null {
  if (!str) return null;
  const trimmed = str.trim();

  // Plain number
  if (!trimmed.includes(':')) {
    const val = parseFloat(trimmed);
    return isNaN(val) || val < 0 ? null : val;
  }

  const parts = trimmed.split(':');
  if (parts.length === 2) {
    const mins = parseFloat(parts[0]);
    const secs = parseFloat(parts[1]);
    if (isNaN(mins) || isNaN(secs) || mins < 0 || secs < 0) return null;
    return mins * 60 + secs;
  }

  if (parts.length === 3) {
    const hrs = parseFloat(parts[0]);
    const mins = parseFloat(parts[1]);
    const secs = parseFloat(parts[2]);
    if (isNaN(hrs) || isNaN(mins) || isNaN(secs) || hrs < 0 || mins < 0 || secs < 0) return null;
    return hrs * 3600 + mins * 60 + secs;
  }

  return null;
}

/**
 * Formats byte size to human-readable string (KB, MB, GB)
 */
export function formatFileSize(bytes: number): string {
  if (isNaN(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const idx = Math.min(i, units.length - 1);
  const size = bytes / Math.pow(1024, idx);
  return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}
