'use client';

import { useRef, useEffect, useState, useCallback, lazy, Suspense, ReactNode, useMemo } from 'react';
import { useSeiData } from '@/hooks/useSeiData';
import { TelemetryCard } from './TelemetryCard';
import { VideoSequence, ANGLE_LABELS, ANGLE_ORDER, VideoMoment } from '@/types/video';
import { findMomentForTime, toAbsoluteTime } from '@/lib/sequence-detector';
import {
  IconArrowUp,
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUpLeft,
  IconArrowUpRight,
  IconSquare,
  IconPictureInPicture,
  IconColumns3,
  IconLayoutGrid,
  IconBolt,
  IconMapPin,
  IconMaximize,
  IconMinimize,
  IconPlayerPlay,
  IconPlayerPause,
  IconRewindBackward15,
  IconRewindForward15,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
  IconList,
  IconPlus,
  IconTrash,
  IconChevronDown,
  IconCheck,
} from '@tabler/icons-react';
import { VideoExporter } from './VideoExporter';
import { TelemetryTimeline } from './TelemetryTimeline';

// Lazy load MapView to avoid SSR issues with Leaflet
const MapView = lazy(() => import('./MapView').then(mod => ({ default: mod.MapView })));

interface VideoPlayerProps {
  sequences: VideoSequence[];
  selectedSequence: VideoSequence | null;
  onSelectSequence: (sequence: VideoSequence) => void;
  onClear: () => void;
  onAddFiles: (files: File[]) => void;
}

const ANGLE_ICONS: Record<string, ReactNode> = {
  front: <IconArrowUp size={14} />,
  back: <IconArrowDown size={14} />,
  left_repeater: <IconArrowLeft size={14} />,
  right_repeater: <IconArrowRight size={14} />,
  left_pillar: <IconArrowUpLeft size={14} />,
  right_pillar: <IconArrowUpRight size={14} />,
};

type LayoutType = 'single' | 'pip' | 'triple' | 'all';

interface LayoutConfig {
  id: LayoutType;
  label: string;
  icon: ReactNode;
  description: string;
}

const LAYOUTS: LayoutConfig[] = [
  {
    id: 'single',
    label: 'Single',
    icon: <IconSquare size={14} />,
    description: 'One camera',
  },
  {
    id: 'pip',
    label: 'PiP',
    icon: <IconPictureInPicture size={14} />,
    description: 'Main + corners',
  },
  {
    id: 'triple',
    label: 'Triple',
    icon: <IconColumns3 size={14} />,
    description: 'Front + sides',
  },
  {
    id: 'all',
    label: 'All 6',
    icon: <IconLayoutGrid size={14} />,
    description: 'All cameras',
  },
];

export function VideoPlayer({
  sequences,
  selectedSequence: sequence,
  onSelectSequence,
  onClear,
  onAddFiles,
}: VideoPlayerProps) {
  const [showSequenceMenu, setShowSequenceMenu] = useState(false);
  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // Playback state
  const [selectedAngle, setSelectedAngle] = useState<string>('front');
  const [layout, setLayout] = useState<LayoutType>('single');
  const [currentMomentIndex, setCurrentMomentIndex] = useState(0);
  const [localTime, setLocalTime] = useState(0);  // Time within current clip
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedUnit, setSpeedUnit] = useState<'mph' | 'kmh'>('mph');
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showMap, setShowMap] = useState(true);
  const [showTelemetry, setShowTelemetry] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTimelineDragging, setIsTimelineDragging] = useState(false);

  // Video URL management
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const [preloadedUrls, setPreloadedUrls] = useState<Record<string, string>>({});

  // Current moment from sequence
  const currentMoment = sequence?.moments[currentMomentIndex] || null;

  // Calculate absolute time and total duration
  const absoluteTime = useMemo(() => {
    if (!sequence) return 0;
    return toAbsoluteTime(sequence, currentMomentIndex, localTime);
  }, [sequence, currentMomentIndex, localTime]);

  const totalDuration = sequence?.totalDuration || 0;

  // Get the main video file for SEI data
  const mainVideo = currentMoment?.videos.find(v => v.angle === 'front') || currentMoment?.videos[0];

  const { seiData, isLoading, error, allSeiMessages, fps } = useSeiData(
    sequence,
    currentMomentIndex,
    absoluteTime
  );

  // Reset state when sequence changes
  useEffect(() => {
    if (sequence && sequence.moments.length > 0) {
      setCurrentMomentIndex(0);
      setLocalTime(0);
      setIsPlaying(false);

      // Auto-select first available angle (prefer front)
      const firstMoment = sequence.moments[0];
      const frontVideo = firstMoment.videos.find(v => v.angle === 'front');
      setSelectedAngle(frontVideo?.angle || firstMoment.videos[0]?.angle || 'front');
    }
  }, [sequence?.id]);

  // Create object URLs for current moment's videos
  useEffect(() => {
    if (!currentMoment) {
      setVideoUrls({});
      return;
    }

    const urls: Record<string, string> = {};
    for (const video of currentMoment.videos) {
      urls[video.angle] = URL.createObjectURL(video.file);
    }
    setVideoUrls(urls);

    return () => {
      Object.values(urls).forEach(url => URL.revokeObjectURL(url));
    };
  }, [currentMoment?.id]);

  // Preload next moment's videos for seamless transition
  useEffect(() => {
    if (!sequence || currentMomentIndex >= sequence.moments.length - 1) {
      setPreloadedUrls({});
      return;
    }

    const nextMoment = sequence.moments[currentMomentIndex + 1];
    const urls: Record<string, string> = {};
    for (const video of nextMoment.videos) {
      urls[video.angle] = URL.createObjectURL(video.file);
    }
    setPreloadedUrls(urls);

    return () => {
      Object.values(urls).forEach(url => URL.revokeObjectURL(url));
    };
  }, [sequence?.id, currentMomentIndex]);

  // Sync all videos to main video time
  const syncVideos = useCallback((targetTime?: number) => {
    const mainTime = targetTime ?? mainVideoRef.current?.currentTime ?? 0;
    Object.entries(videoRefs.current).forEach(([angle, video]) => {
      if (video && angle !== selectedAngle && Math.abs(video.currentTime - mainTime) > 0.1) {
        video.currentTime = mainTime;
      }
    });
    if (targetTime !== undefined && mainVideoRef.current) {
      mainVideoRef.current.currentTime = targetTime;
      setLocalTime(targetTime);
    }
  }, [selectedAngle]);

  const handleTimeUpdate = useCallback(() => {
    if (mainVideoRef.current) {
      setLocalTime(mainVideoRef.current.currentTime);
      syncVideos();
    }
  }, [syncVideos]);

  // Handle video ended - auto-advance to next clip
  const handleVideoEnded = useCallback(() => {
    if (!sequence) return;

    if (currentMomentIndex < sequence.moments.length - 1) {
      // Advance to next clip
      setCurrentMomentIndex(prev => prev + 1);
      setLocalTime(0);
      // Will auto-play after new video loads
    } else {
      // End of sequence
      setIsPlaying(false);
    }
  }, [sequence, currentMomentIndex]);

  // Track playback state for restoring after layout/angle changes
  const pendingRestoreRef = useRef<{ time: number; playing: boolean } | null>(null);
  const shouldAutoPlayRef = useRef(false);

  const handleLoadedMetadata = useCallback(() => {
    if (mainVideoRef.current) {
      // Restore playback position if pending
      if (pendingRestoreRef.current) {
        const { time, playing } = pendingRestoreRef.current;
        mainVideoRef.current.currentTime = time;
        Object.values(videoRefs.current).forEach(v => {
          if (v) v.currentTime = time;
        });
        if (playing) {
          mainVideoRef.current.play().catch(() => {});
          Object.values(videoRefs.current).forEach(v => v?.play().catch(() => {}));
          setIsPlaying(true);
        }
        pendingRestoreRef.current = null;
      }

      // Auto-play after advancing to next clip
      if (shouldAutoPlayRef.current) {
        mainVideoRef.current.play().catch(() => {});
        Object.values(videoRefs.current).forEach(v => v?.play().catch(() => {}));
        setIsPlaying(true);
        shouldAutoPlayRef.current = false;
      }
    }
  }, []);

  // When moment index changes, check if we should auto-play
  useEffect(() => {
    if (isPlaying && currentMomentIndex > 0) {
      shouldAutoPlayRef.current = true;
    }
  }, [currentMomentIndex]);

  // Custom setters that preserve playback state
  const handleLayoutChange = useCallback((newLayout: LayoutType) => {
    if (newLayout === layout) return;
    pendingRestoreRef.current = { time: localTime, playing: isPlaying };
    setLayout(newLayout);
  }, [layout, localTime, isPlaying]);

  const handleAngleChange = useCallback((newAngle: string) => {
    if (newAngle === selectedAngle) return;
    pendingRestoreRef.current = { time: localTime, playing: isPlaying };
    setSelectedAngle(newAngle);
  }, [selectedAngle, localTime, isPlaying]);

  // Fullscreen handler
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(() => {});
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch(() => {});
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Close sequence menu when clicking outside
  useEffect(() => {
    if (!showSequenceMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-sequence-menu]')) {
        setShowSequenceMenu(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showSequenceMenu]);

  const togglePlay = useCallback(() => {
    if (mainVideoRef.current) {
      if (isPlaying) {
        mainVideoRef.current.pause();
        Object.values(videoRefs.current).forEach(v => v?.pause());
      } else {
        mainVideoRef.current.play();
        Object.values(videoRefs.current).forEach(v => v?.play().catch(() => {}));
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  // Seek to absolute time (handles cross-clip seeking)
  const seekToAbsoluteTime = useCallback((targetAbsoluteTime: number) => {
    if (!sequence) return;

    const clampedTime = Math.max(0, Math.min(targetAbsoluteTime, totalDuration));
    const { momentIndex, localTime: newLocalTime } = findMomentForTime(sequence, clampedTime);

    if (momentIndex !== currentMomentIndex) {
      // Need to change clips
      pendingRestoreRef.current = { time: newLocalTime, playing: isPlaying };
      setCurrentMomentIndex(momentIndex);
      setLocalTime(newLocalTime);
    } else {
      // Same clip, just seek
      syncVideos(newLocalTime);
    }
  }, [sequence, totalDuration, currentMomentIndex, isPlaying, syncVideos]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    seekToAbsoluteTime(time);
  }, [seekToAbsoluteTime]);

  const handleTimelineSeek = useCallback((time: number) => {
    seekToAbsoluteTime(time);
  }, [seekToAbsoluteTime]);

  const handlePlaybackRateChange = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (mainVideoRef.current) {
      mainVideoRef.current.playbackRate = rate;
    }
    Object.values(videoRefs.current).forEach(v => {
      if (v) v.playbackRate = rate;
    });
  }, []);

  // Skip to previous/next clip
  const skipToPreviousClip = useCallback(() => {
    if (!sequence || currentMomentIndex <= 0) return;
    pendingRestoreRef.current = { time: 0, playing: isPlaying };
    setCurrentMomentIndex(prev => prev - 1);
    setLocalTime(0);
  }, [sequence, currentMomentIndex, isPlaying]);

  const skipToNextClip = useCallback(() => {
    if (!sequence || currentMomentIndex >= sequence.moments.length - 1) return;
    pendingRestoreRef.current = { time: 0, playing: isPlaying };
    setCurrentMomentIndex(prev => prev + 1);
    setLocalTime(0);
  }, [sequence, currentMomentIndex, isPlaying]);

  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Click on a sub-video to make it the main selected angle
  const handleVideoClick = useCallback((angle: string) => {
    if (layout === 'single') {
      togglePlay();
    } else {
      handleAngleChange(angle);
    }
  }, [layout, togglePlay, handleAngleChange]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!mainVideoRef.current || !sequence) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekToAbsoluteTime(absoluteTime - 5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekToAbsoluteTime(absoluteTime + 5);
          break;
        case 'u':
          setSpeedUnit((prev) => (prev === 'mph' ? 'kmh' : 'mph'));
          break;
        case '1':
          handleLayoutChange('single');
          break;
        case '2':
          handleLayoutChange('pip');
          break;
        case '3':
          handleLayoutChange('triple');
          break;
        case '4':
          handleLayoutChange('all');
          break;
        case 'm':
          setShowMap(prev => !prev);
          break;
        case 't':
          setShowTelemetry(prev => !prev);
          break;
        case 'f':
          toggleFullscreen();
          break;
        case '[':
          skipToPreviousClip();
          break;
        case ']':
          skipToNextClip();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, absoluteTime, sequence, seekToAbsoluteTime, handleLayoutChange, toggleFullscreen, skipToPreviousClip, skipToNextClip]);

  if (!sequence || !currentMoment || Object.keys(videoUrls).length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl aspect-video flex items-center justify-center">
        <div className="text-center text-gray-500">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p>Select a sequence to play</p>
        </div>
      </div>
    );
  }

  const availableAngles = currentMoment.videos.map(v => v.angle);

  // Render a single video element
  const renderVideo = (angle: string, isMain: boolean, className: string = '') => {
    const url = videoUrls[angle];
    const isAvailable = availableAngles.includes(angle);

    if (!url || !isAvailable) {
      return (
        <div className={`bg-gray-900 flex items-center justify-center text-gray-600 text-xs ${className}`}>
          {ANGLE_LABELS[angle] || angle}
        </div>
      );
    }

    return (
      <div className={`relative ${className}`}>
        <video
          ref={(el) => {
            videoRefs.current[angle] = el;
            if (isMain) {
              (mainVideoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
            }
          }}
          src={url}
          className="w-full h-full object-contain bg-black"
          muted={!isMain}
          onTimeUpdate={isMain ? handleTimeUpdate : undefined}
          onLoadedMetadata={isMain ? handleLoadedMetadata : undefined}
          onEnded={isMain ? handleVideoEnded : undefined}
          onPlay={isMain ? () => setIsPlaying(true) : undefined}
          onPause={isMain ? () => setIsPlaying(false) : undefined}
          onClick={() => isMain ? togglePlay() : handleAngleChange(angle)}
        />
        {isMain && layout !== 'single' && layout !== 'pip' && (
          <div className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full" />
        )}
      </div>
    );
  };

  // Play button overlay
  const renderPlayOverlay = () => {
    if (isPlaying || isTimelineDragging) return null;
    return (
      <button
        onClick={togglePlay}
        className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors z-10"
      >
        <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
          <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 20 20">
            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
          </svg>
        </div>
      </button>
    );
  };

  // Render video grid based on layout
  const renderVideoGrid = () => {
    // Single view - just one camera
    if (layout === 'single') {
      return (
        <div className="relative aspect-video bg-black flex items-center justify-center">
          <div className="w-full h-full">
            {renderVideo(selectedAngle, true, 'w-full h-full')}
          </div>
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm rounded px-2 py-1 text-xs font-medium flex items-center gap-1">
            {ANGLE_ICONS[selectedAngle]} {ANGLE_LABELS[selectedAngle]}
          </div>
          {/* Clip indicator for multi-clip sequences */}
          {sequence.clipCount > 1 && (
            <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm rounded px-2 py-1 text-xs font-medium">
              Clip {currentMomentIndex + 1}/{sequence.clipCount}
            </div>
          )}
          {renderPlayOverlay()}
        </div>
      );
    }

    // PiP view - main camera with corners
    if (layout === 'pip') {
      const pipAngles = ['left_repeater', 'right_repeater', 'back'].filter(
        a => a !== selectedAngle && availableAngles.includes(a)
      );

      return (
        <div className="relative aspect-video bg-black flex items-center justify-center">
          <div className="w-full h-full">
            {renderVideo(selectedAngle, true, 'w-full h-full')}
          </div>
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm rounded px-2 py-1 text-xs font-medium flex items-center gap-1">
            {ANGLE_ICONS[selectedAngle]} {ANGLE_LABELS[selectedAngle]}
          </div>

          {/* Corner PiP windows */}
          <div className="absolute bottom-3 left-3 right-3 flex justify-between pointer-events-none">
            {pipAngles.slice(0, 2).map((angle) => (
              <div
                key={angle}
                className="w-[18%] aspect-video rounded-lg overflow-hidden border border-white/20 shadow-lg pointer-events-auto cursor-pointer hover:border-blue-400 transition-colors"
                onClick={() => handleAngleChange(angle)}
              >
                {renderVideo(angle, false, 'w-full h-full')}
              </div>
            ))}
          </div>

          {/* Optional third PiP in top-left */}
          {pipAngles[2] && (
            <div
              className="absolute top-3 left-3 w-[18%] aspect-video rounded-lg overflow-hidden border border-white/20 shadow-lg cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => handleAngleChange(pipAngles[2])}
            >
              {renderVideo(pipAngles[2], false, 'w-full h-full')}
            </div>
          )}

          {renderPlayOverlay()}
        </div>
      );
    }

    // Triple view - front + left + right in a row
    if (layout === 'triple') {
      const tripleAngles = ['left_repeater', 'front', 'right_repeater'];

      return (
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
          <div className="flex gap-1 h-full p-1 items-center justify-center">
            {tripleAngles.map((angle) => {
              const isMain = angle === selectedAngle;
              const isAvailable = availableAngles.includes(angle);

              return (
                <div
                  key={angle}
                  className={`relative h-full aspect-video rounded overflow-hidden ${
                    isMain ? 'ring-2 ring-blue-500' : ''
                  } ${isAvailable ? 'cursor-pointer' : 'opacity-40'}`}
                  onClick={() => isAvailable && handleAngleChange(angle)}
                >
                  {renderVideo(angle, isMain, 'w-full h-full')}
                </div>
              );
            })}
          </div>
          {renderPlayOverlay()}
        </div>
      );
    }

    // All 6 cameras - 2 rows of 3
    if (layout === 'all') {
      const rows = [
        ['left_repeater', 'left_pillar', 'front'],
        ['right_repeater', 'right_pillar', 'back'],
      ];

      return (
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 flex flex-col gap-1 p-1">
            {rows.map((row, rowIdx) => (
              <div key={rowIdx} className="flex-1 flex gap-1 min-h-0">
                {row.map((angle) => {
                  const isMain = angle === selectedAngle;
                  const isAvailable = availableAngles.includes(angle);

                  return (
                    <div
                      key={angle}
                      className={`relative flex-1 rounded overflow-hidden ${
                        isMain ? 'ring-2 ring-blue-500' : ''
                      } ${isAvailable ? 'cursor-pointer' : 'opacity-40'}`}
                      onClick={() => isAvailable && handleAngleChange(angle)}
                    >
                      {renderVideo(angle, isMain, 'w-full h-full')}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {renderPlayOverlay()}
        </div>
      );
    }

    return null;
  };

  return (
    <div
      ref={containerRef}
      className={`space-y-2 ${isFullscreen ? 'fixed inset-0 z-50 bg-black p-4 flex flex-col' : ''}`}
    >
      {/* Video Container with Overlays */}
      <div
        ref={videoContainerRef}
        className={`relative bg-black rounded-xl overflow-hidden ${isFullscreen ? 'flex-1' : ''}`}
      >
        {renderVideoGrid()}

        {/* Telemetry Overlay - Top Center */}
        {showTelemetry && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20">
            <TelemetryCard
              seiData={seiData}
              isLoading={isLoading}
              error={error}
              speedUnit={speedUnit}
              onSpeedUnitToggle={() => setSpeedUnit(prev => prev === 'mph' ? 'kmh' : 'mph')}
            />
          </div>
        )}

        {/* Map Overlay - Top Right for PiP, Bottom Right for others */}
        {showMap && (
          <div className={`absolute z-20 w-[180px] h-[180px] rounded-lg overflow-hidden shadow-xl opacity-90 hover:opacity-100 transition-opacity ${
            layout === 'pip' ? 'top-3 right-3' : 'bottom-3 right-3'
          }`}>
            <Suspense fallback={
              <div className="bg-gray-900 w-full h-full flex items-center justify-center">
                <div className="text-gray-500 text-xs">Loading...</div>
              </div>
            }>
              <MapView seiData={seiData} />
            </Suspense>
          </div>
        )}
      </div>

      {/* Playback Controls - Under Video */}
      <div className="bg-gray-800/50 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Skip to Previous Clip */}
          {sequence.clipCount > 1 && (
            <button
              onClick={skipToPreviousClip}
              disabled={currentMomentIndex === 0}
              className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full transition-all ${
                currentMomentIndex === 0
                  ? 'bg-white/5 text-gray-600 cursor-not-allowed'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
              title="Previous clip ([)"
            >
              <IconPlayerSkipBack size={16} />
            </button>
          )}

          {/* Skip Back 15s */}
          <button
            onClick={() => seekToAbsoluteTime(absoluteTime - 15)}
            className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-all"
            title="Back 15s"
          >
            <IconRewindBackward15 size={18} className="text-white" />
          </button>

          {/* Play/Pause Button */}
          <button
            onClick={togglePlay}
            className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-all"
          >
            {isPlaying ? (
              <IconPlayerPause size={24} className="text-white" />
            ) : (
              <IconPlayerPlay size={24} className="text-white ml-0.5" />
            )}
          </button>

          {/* Skip Forward 15s */}
          <button
            onClick={() => seekToAbsoluteTime(absoluteTime + 15)}
            className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-all"
            title="Forward 15s"
          >
            <IconRewindForward15 size={18} className="text-white" />
          </button>

          {/* Skip to Next Clip */}
          {sequence.clipCount > 1 && (
            <button
              onClick={skipToNextClip}
              disabled={currentMomentIndex >= sequence.moments.length - 1}
              className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full transition-all ${
                currentMomentIndex >= sequence.moments.length - 1
                  ? 'bg-white/5 text-gray-600 cursor-not-allowed'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
              title="Next clip (])"
            >
              <IconPlayerSkipForward size={16} />
            </button>
          )}

          {/* Time + Timeline */}
          <span className="text-sm text-gray-400 w-12 tabular-nums ml-2">{formatTime(absoluteTime)}</span>
          <input
            type="range"
            min={0}
            max={totalDuration || 0}
            step={0.1}
            value={absoluteTime}
            onChange={handleSeek}
            className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
          <span className="text-sm text-gray-400 w-12 tabular-nums">{formatTime(totalDuration)}</span>

          {/* Playback Speed */}
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {[0.5, 1, 1.5, 2].map((rate) => (
              <button
                key={rate}
                onClick={() => handlePlaybackRateChange(rate)}
                className={`px-2 py-1 text-xs font-medium rounded-lg transition-colors ${
                  playbackRate === rate ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Control Bar: Camera + Layout + Date + Toggles */}
      <div className="bg-gray-800/50 rounded-xl px-3 py-2">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Camera buttons (for single and pip views) */}
          {(layout === 'single' || layout === 'pip') && (
            <div className="flex items-center gap-1">
              {ANGLE_ORDER.map((angle) => {
                const isAvailable = availableAngles.includes(angle);
                const isActive = selectedAngle === angle;

                return (
                  <button
                    key={angle}
                    disabled={!isAvailable}
                    onClick={() => isAvailable && handleAngleChange(angle)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : isAvailable
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    {ANGLE_ICONS[angle]}
                  </button>
                );
              })}
            </div>
          )}

          {/* Divider */}
          {(layout === 'single' || layout === 'pip') && (
            <div className="w-px h-5 bg-gray-700" />
          )}

          {/* Layout buttons */}
          <div className="flex items-center gap-1">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                onClick={() => handleLayoutChange(l.id)}
                className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                  layout === l.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
                title={l.label}
              >
                {l.icon}
              </button>
            ))}
          </div>

          {/* Date/Time */}
          <div className="text-xs text-gray-500">
            {currentMoment.time} · {currentMoment.date}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Overlay Toggles */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowTelemetry(prev => !prev)}
              className={`p-1.5 rounded transition-all ${
                showTelemetry
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
              title="Toggle telemetry (T)"
            >
              <IconBolt size={16} />
            </button>
            <button
              onClick={() => setShowMap(prev => !prev)}
              className={`p-1.5 rounded transition-all ${
                showMap
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
              title="Toggle map (M)"
            >
              <IconMapPin size={16} />
            </button>

            {/* Divider */}
            <div className="w-px h-4 bg-gray-600 mx-1" />

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded bg-gray-700 text-gray-400 hover:bg-gray-600 transition-all"
              title="Fullscreen (F)"
            >
              {isFullscreen ? <IconMinimize size={16} /> : <IconMaximize size={16} />}
            </button>

            {/* Divider */}
            <div className="w-px h-4 bg-gray-600 mx-1" />

            {/* Export */}
            <VideoExporter
              sequence={sequence}
              selectedAngle={selectedAngle}
              allSeiMessages={allSeiMessages}
              fps={fps}
              speedUnit={speedUnit}
              filename={`tesla-${sequence.dateRange}-${sequence.timeRange.split(' - ')[0].replace(/:/g, '-')}`}
            />

            {/* Divider */}
            <div className="w-px h-4 bg-gray-600 mx-1" />

            {/* Sequence Selector */}
            <div className="relative" data-sequence-menu>
              <button
                onClick={() => setShowSequenceMenu(prev => !prev)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-all ${
                  showSequenceMenu
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <IconList size={14} />
                <span className="max-w-[100px] truncate">
                  {sequences.length > 1 ? `${sequences.indexOf(sequence) + 1}/${sequences.length}` : 'Sequences'}
                </span>
                <IconChevronDown size={14} className={`transition-transform ${showSequenceMenu ? 'rotate-180' : ''}`} />
              </button>

              {/* Sequence Dropdown Menu */}
              {showSequenceMenu && (
                <div className="absolute bottom-full right-0 mb-2 w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50">
                  <div className="max-h-64 overflow-y-auto">
                    {sequences.map((seq, idx) => {
                      const isSelected = seq.id === sequence.id;
                      return (
                        <button
                          key={seq.id}
                          onClick={() => {
                            onSelectSequence(seq);
                            setShowSequenceMenu(false);
                          }}
                          className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-colors ${
                            isSelected
                              ? 'bg-blue-600/20 text-white'
                              : 'hover:bg-gray-800 text-gray-300'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">
                              {seq.moments[0].time}
                              {seq.clipCount > 1 && (
                                <span className="text-gray-400"> - {seq.moments[seq.clipCount - 1].time}</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 flex items-center gap-2">
                              <span>{seq.dateRange}</span>
                              <span>·</span>
                              <span>{seq.durationFormatted}</span>
                              {seq.clipCount > 1 && (
                                <>
                                  <span>·</span>
                                  <span>{seq.clipCount} clips</span>
                                </>
                              )}
                            </div>
                          </div>
                          {isSelected && <IconCheck size={16} className="text-blue-400 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  {/* Actions */}
                  <div className="border-t border-gray-700 p-2 flex gap-2">
                    <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium cursor-pointer transition-colors">
                      <IconPlus size={14} />
                      Add More
                      <input
                        type="file"
                        accept="video/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) {
                            onAddFiles(Array.from(e.target.files));
                            setShowSequenceMenu(false);
                          }
                        }}
                      />
                    </label>
                    <button
                      onClick={() => {
                        onClear();
                        setShowSequenceMenu(false);
                      }}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-medium transition-colors"
                    >
                      <IconTrash size={14} />
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Telemetry Timeline */}
      {allSeiMessages.length > 0 && (
        <TelemetryTimeline
          allSeiMessages={allSeiMessages}
          fps={fps}
          duration={totalDuration}
          currentTime={absoluteTime}
          onSeek={handleTimelineSeek}
          onDraggingChange={setIsTimelineDragging}
          clipBoundaries={sequence.momentOffsets}
        />
      )}

    </div>
  );
}
