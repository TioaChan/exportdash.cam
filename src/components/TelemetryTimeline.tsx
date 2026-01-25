'use client';

import { useMemo, useRef, useCallback, useEffect, useState } from 'react';
import { SeiWithFrameIndex } from '@/lib/dashcam-mp4';

interface TelemetryTimelineProps {
  allSeiMessages: SeiWithFrameIndex[];
  fps: number;
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  onDraggingChange?: (isDragging: boolean) => void;
  clipBoundaries?: number[];  // Offset times where each clip starts (for multi-clip sequences)
}

interface EventSegment {
  startTime: number;
  endTime: number;
  intensity?: number; // 0-1 for continuous values like gas
}

interface TrackData {
  id: string;
  label: string;
  color: string;
  segments: EventSegment[];
}

export function TelemetryTimeline({
  allSeiMessages,
  fps,
  duration,
  currentTime,
  onSeek,
  onDraggingChange,
  clipBoundaries = [],
}: TelemetryTimelineProps) {
  // Process telemetry data into timeline tracks
  const tracks = useMemo((): TrackData[] => {
    if (allSeiMessages.length === 0 || fps <= 0) return [];

    const frameToTime = (frameIndex: number) => frameIndex / fps;
    const frameDuration = 1 / fps;

    // Helper to build segments from boolean events
    const buildBooleanSegments = (
      predicate: (sei: SeiWithFrameIndex) => boolean
    ): EventSegment[] => {
      const segments: EventSegment[] = [];
      let currentSegment: EventSegment | null = null;

      for (const msg of allSeiMessages) {
        const time = frameToTime(msg.frameIndex);
        const isActive = predicate(msg);

        if (isActive && !currentSegment) {
          currentSegment = { startTime: time, endTime: time + frameDuration };
        } else if (isActive && currentSegment) {
          currentSegment.endTime = time + frameDuration;
        } else if (!isActive && currentSegment) {
          segments.push(currentSegment);
          currentSegment = null;
        }
      }

      if (currentSegment) {
        segments.push(currentSegment);
      }

      return segments;
    };

    // Helper to build segments with intensity for continuous values
    const buildIntensitySegments = (
      getValue: (sei: SeiWithFrameIndex) => number,
      threshold: number = 0.05
    ): EventSegment[] => {
      const segments: EventSegment[] = [];
      let currentSegment: EventSegment | null = null;

      for (const msg of allSeiMessages) {
        const time = frameToTime(msg.frameIndex);
        const value = getValue(msg);
        const isActive = value > threshold;

        if (isActive && !currentSegment) {
          currentSegment = { startTime: time, endTime: time + frameDuration, intensity: value };
        } else if (isActive && currentSegment) {
          currentSegment.endTime = time + frameDuration;
          // Update intensity to max seen in this segment
          currentSegment.intensity = Math.max(currentSegment.intensity || 0, value);
        } else if (!isActive && currentSegment) {
          segments.push(currentSegment);
          currentSegment = null;
        }
      }

      if (currentSegment) {
        segments.push(currentSegment);
      }

      return segments;
    };

    // Build all tracks
    return [
      {
        id: 'gas',
        label: 'Gas',
        color: '#22c55e', // green
        segments: buildIntensitySegments((msg) => {
          const val = msg.sei.accelerator_pedal_position || 0;
          return val > 1 ? val / 100 : val; // Normalize to 0-1
        }),
      },
      {
        id: 'brake',
        label: 'Brake',
        color: '#ef4444', // red
        segments: buildBooleanSegments((msg) => msg.sei.brake_applied === true),
      },
      {
        id: 'left-blinker',
        label: 'Left',
        color: '#f59e0b', // amber
        segments: buildBooleanSegments((msg) => msg.sei.blinker_on_left === true),
      },
      {
        id: 'right-blinker',
        label: 'Right',
        color: '#f59e0b', // amber
        segments: buildBooleanSegments((msg) => msg.sei.blinker_on_right === true),
      },
      {
        id: 'steering',
        label: 'Steer',
        color: '#3b82f6', // blue
        segments: buildIntensitySegments((msg) => {
          const angle = Math.abs(msg.sei.steering_wheel_angle || 0);
          return Math.min(1, angle / 180); // Normalize to 0-1 (180° = full)
        }, 0.1),
      },
    ];
  }, [allSeiMessages, fps]);

  // Dragging/scrubbing state
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Notify parent when dragging state changes
  useEffect(() => {
    onDraggingChange?.(isDragging);
  }, [isDragging, onDraggingChange]);

  // Calculate time from mouse position
  const getTimeFromEvent = useCallback((clientX: number): number => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    return percentage * duration;
  }, [duration]);

  // Handle mouse down - start dragging
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    const time = getTimeFromEvent(e.clientX);
    onSeek(time);
  }, [getTimeFromEvent, onSeek]);

  // Handle touch start - start dragging
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    setIsDragging(true);
    const time = getTimeFromEvent(e.touches[0].clientX);
    onSeek(time);
  }, [getTimeFromEvent, onSeek]);

  // Handle mouse/touch move while dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const time = getTimeFromEvent(e.clientX);
      onSeek(time);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const time = getTimeFromEvent(e.touches[0].clientX);
      onSeek(time);
    };

    const handleEnd = () => {
      setIsDragging(false);
    };

    // Listen on document to catch events outside the component
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleEnd);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, getTimeFromEvent, onSeek]);

  if (allSeiMessages.length === 0 || duration <= 0) {
    return null;
  }

  const playheadPosition = (currentTime / duration) * 100;

  // Generate time markers at 15 second intervals
  const timeMarkers = useMemo(() => {
    const markers: number[] = [];
    for (let t = 0; t <= duration; t += 15) {
      markers.push(t);
    }
    // Always include the end time if not already there
    if (markers[markers.length - 1] !== duration) {
      markers.push(duration);
    }
    return markers;
  }, [duration]);

  // Format time as m:ss
  const formatTimeShort = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-gray-800/50 rounded-xl p-3 space-y-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400 font-medium">Event Timeline</span>
        <div className="flex items-center gap-3">
          {tracks.map((track) => (
            <div key={track.id} className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: track.color }}
              />
              <span className="text-[10px] text-gray-500">{track.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline tracks */}
      <div
        ref={timelineRef}
        className={`relative select-none ${isDragging ? 'cursor-grabbing' : 'cursor-pointer'}`}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        {/* Clip boundary markers (for multi-clip sequences) */}
        {clipBoundaries.length > 1 && clipBoundaries.slice(1).map((boundary, idx) => (
          <div
            key={`clip-${idx}`}
            className="absolute top-0 bottom-0 w-0.5 z-[2] pointer-events-none"
            style={{
              left: `${(boundary / duration) * 100}%`,
              background: 'repeating-linear-gradient(to bottom, #3b82f6 0, #3b82f6 4px, transparent 4px, transparent 8px)',
            }}
            title={`Clip ${idx + 2} start`}
          />
        ))}

        {/* 15-second interval lines */}
        {timeMarkers.slice(1, -1).map((time) => (
          <div
            key={time}
            className="absolute top-0 bottom-0 w-px bg-gray-600/50 z-[1] pointer-events-none"
            style={{ left: `${(time / duration) * 100}%` }}
          />
        ))}

        {tracks.map((track) => (
          <div
            key={track.id}
            className="relative h-3 bg-gray-700/50 rounded-sm mb-0.5 overflow-hidden"
            title={track.label}
          >
            {/* Event segments */}
            {track.segments.map((segment, idx) => {
              const left = (segment.startTime / duration) * 100;
              const width = ((segment.endTime - segment.startTime) / duration) * 100;
              const opacity = segment.intensity !== undefined ? 0.4 + segment.intensity * 0.6 : 0.9;

              return (
                <div
                  key={idx}
                  className="absolute top-0 bottom-0 rounded-sm"
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 0.5)}%`,
                    backgroundColor: track.color,
                    opacity,
                  }}
                />
              );
            })}
          </div>
        ))}

        {/* Playhead */}
        <div
          className={`absolute top-0 bottom-0 w-0.5 bg-white shadow-lg z-10 pointer-events-none transition-transform ${
            isDragging ? 'scale-x-150' : ''
          }`}
          style={{ left: `${playheadPosition}%` }}
        >
          <div className={`absolute -top-1 left-1/2 -translate-x-1/2 bg-white rounded-full transition-all ${
            isDragging ? 'w-3 h-3 -top-1.5 shadow-lg shadow-white/30' : 'w-2 h-2'
          }`} />
        </div>
      </div>

      {/* Time legend */}
      <div className="relative h-4 mt-1">
        {timeMarkers.map((time, idx) => {
          const position = (time / duration) * 100;
          const isFirst = idx === 0;
          const isLast = idx === timeMarkers.length - 1;

          return (
            <div
              key={time}
              className="absolute flex flex-col items-center pointer-events-none"
              style={{
                left: `${position}%`,
                transform: isFirst ? 'translateX(0)' : isLast ? 'translateX(-100%)' : 'translateX(-50%)',
              }}
            >
              <div className="w-px h-1.5 bg-gray-600" />
              <span className="text-[9px] text-gray-500 tabular-nums">{formatTimeShort(time)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
