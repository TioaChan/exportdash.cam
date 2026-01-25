/**
 * Video Types for Tesla Dashcam Viewer
 *
 * Data hierarchy:
 * - VideoMoment: One timestamp (all camera angles at that moment)
 * - VideoSequence: Consecutive moments merged for seamless playback
 */

/** A single camera angle video file */
export interface CameraVideo {
  file: File;
  angle: string;           // e.g., 'front', 'back', 'left_repeater'
  angleLabel: string;      // Human-readable label
  duration: number;        // Duration in seconds
  durationFormatted: string | null;  // e.g., "1:00"
  size: string;            // Human-readable size
}

/** One timestamp - all camera angles at a specific moment */
export interface VideoMoment {
  id: string;              // Unique identifier (timestamp-based)
  timestamp: Date;         // Actual timestamp from filename
  date: string;            // Date string (YYYY-MM-DD)
  time: string;            // Time string (HH:MM:SS)
  dateTime: string;        // Combined date/time for sorting
  videos: CameraVideo[];   // All camera angles for this moment
  duration: number;        // Duration in seconds (from front camera)
}

/** Processing progress state */
export interface ProcessingProgress {
  stage: 'scanning' | 'metadata' | 'ready' | 'error';
  current: number;         // Current file being processed
  total: number;           // Total files to process
  message?: string;        // Optional status message
}

/** A sequence of consecutive moments for seamless playback */
export interface VideoSequence {
  id: string;                    // Unique identifier
  moments: VideoMoment[];        // All moments in chronological order
  startTime: Date;               // Start timestamp
  endTime: Date;                 // End timestamp
  totalDuration: number;         // Total duration in seconds
  clipCount: number;             // Number of clips/moments

  // Computed properties for display
  dateRange: string;             // e.g., "2024-01-15"
  timeRange: string;             // e.g., "10:30:00 - 10:35:00"
  durationFormatted: string;     // e.g., "5:00"

  // Playback mapping: cumulative durations for seeking
  momentOffsets: number[];       // Start time offset for each moment
}

/** Angle constants and utilities */
export const ANGLE_LABELS: Record<string, string> = {
  front: 'Front',
  back: 'Rear',
  left_repeater: 'Left',
  right_repeater: 'Right',
  left_pillar: 'L Pillar',
  right_pillar: 'R Pillar',
};

export const ANGLE_ORDER = ['front', 'left_repeater', 'right_repeater', 'back', 'left_pillar', 'right_pillar'];

/** Trim points for video export */
export interface TrimPoints {
  inPoint: number;   // Start time in seconds
  outPoint: number;  // End time in seconds
}

/** Camera angle segment for multi-angle exports */
export interface CameraSegment {
  startTime: number;
  endTime: number;
  angle: string;     // 'front', 'back', etc.
}

/** Colors for camera angle visualization in timeline */
export const ANGLE_COLORS: Record<string, string> = {
  front: '#3B82F6',      // blue
  back: '#8B5CF6',       // purple
  left_repeater: '#22C55E',  // green
  right_repeater: '#F59E0B', // amber
  left_pillar: '#06B6D4',    // cyan
  right_pillar: '#EC4899',   // pink
};

/** Parse camera angle from filename */
export function parseAngle(filename: string): string | null {
  const lower = filename.toLowerCase();
  for (const angle of ANGLE_ORDER) {
    if (lower.includes(angle)) return angle;
  }
  return null;
}

/** Parse timestamp from Tesla dashcam filename */
export function parseTimestamp(filename: string): Date | null {
  // Tesla format: YYYY-MM-DD_HH-MM-SS-...
  const match = filename.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    parseInt(year),
    parseInt(month) - 1,  // Month is 0-indexed
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second)
  );
}

/** Format duration in seconds to MM:SS */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Format file size to human-readable string */
export function formatFileSize(bytes: number): string {
  const sizeInMB = bytes / (1024 * 1024);
  return sizeInMB >= 1
    ? `${sizeInMB.toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(0)} KB`;
}
