'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { IconDownload, IconPlayerStop, IconLoader2, IconX } from '@tabler/icons-react';
import { SeiData, SeiWithFrameIndex } from '@/lib/dashcam-mp4';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { VideoSequence } from '@/types/video';

interface VideoExporterProps {
  sequence: VideoSequence;
  selectedAngle: string;
  allSeiMessages: SeiWithFrameIndex[];
  fps: number;
  speedUnit: 'mph' | 'kmh';
  filename?: string;
}

// Map tile cache
const tileCache = new Map<string, HTMLImageElement>();

// Convert lat/lng to tile coordinates
function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const x = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
  const y = Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
  return { x, y };
}

// Get pixel position within tile
function latLngToPixelOffset(lat: number, lng: number, zoom: number): { px: number; py: number } {
  const scale = Math.pow(2, zoom) * 256;
  const px = ((lng + 180) / 360) * scale;
  const py =
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * scale;
  return { px: px % 256, py: py % 256 };
}

// Load map tile with caching
async function loadMapTile(x: number, y: number, zoom: number): Promise<HTMLImageElement | null> {
  const key = `${zoom}/${x}/${y}`;
  if (tileCache.has(key)) {
    return tileCache.get(key)!;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      tileCache.set(key, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
  });
}

export function VideoExporter({
  sequence,
  selectedAngle,
  allSeiMessages,
  fps,
  speedUnit,
  filename = 'tesla-cam-export',
}: VideoExporterProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const abortRef = useRef(false);

  // Cleanup
  useEffect(() => {
    return () => {
      if (exportUrl) URL.revokeObjectURL(exportUrl);
    };
  }, [exportUrl]);

  // Get SEI data for a specific time (same logic as useSeiData hook)
  const getSeiForTime = useCallback(
    (time: number): SeiData | null => {
      if (allSeiMessages.length === 0) return null;

      const frameIndex = Math.floor(time * fps);

      // Binary search for nearest SEI message
      let left = 0;
      let right = allSeiMessages.length - 1;

      while (left < right) {
        const mid = Math.floor((left + right + 1) / 2);
        if (allSeiMessages[mid].frameIndex <= frameIndex) {
          left = mid;
        } else {
          right = mid - 1;
        }
      }

      return allSeiMessages[left]?.sei || null;
    },
    [allSeiMessages, fps]
  );

  // Draw telemetry overlay on canvas - matches TelemetryCard.tsx layout
  const drawTelemetry = (ctx: CanvasRenderingContext2D, seiData: SeiData | null, width: number, height: number) => {
    if (!seiData) return;

    const scale = Math.min(width / 1280, height / 720);
    const padding = 12 * scale;
    const circleSize = 28 * scale;
    const circleGap = 5 * scale;
    const columnWidth = circleSize;
    const blinkerWidth = 20 * scale;
    const speedWidth = 60 * scale;
    const gap = 10 * scale;

    // Calculate total width
    const boxWidth = columnWidth + gap + blinkerWidth + gap + speedWidth + gap + blinkerWidth + gap + columnWidth + padding * 2;
    const boxHeight = circleSize * 2 + circleGap + padding * 2;

    // Position at TOP CENTER
    const x = (width - boxWidth) / 2;
    const y = 12 * scale;

    // Draw background
    ctx.fillStyle = 'rgba(225, 225, 225, 0.85)';
    ctx.beginPath();
    ctx.roundRect(x, y, boxWidth, boxHeight, 12 * scale);
    ctx.fill();

    // Calculate positions
    let posX = x + padding;
    const topCircleY = y + padding + circleSize / 2;
    const bottomCircleY = y + padding + circleSize + circleGap + circleSize / 2;
    const centerY = y + boxHeight / 2;

    // === Left Column: Gear + Brake ===
    ctx.fillStyle = '#a4a4a4';
    ctx.beginPath();
    ctx.arc(posX + circleSize / 2, topCircleY, circleSize / 2, 0, Math.PI * 2);
    ctx.fill();
    const gearLetter = ['P', 'D', 'R', 'N'][seiData.gear_state ?? 0] || 'P';
    ctx.fillStyle = '#006deb';
    ctx.font = `bold ${16 * scale}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(gearLetter, posX + circleSize / 2, topCircleY);

    // Brake circle
    ctx.fillStyle = seiData.brake_applied ? '#ff4444' : '#a4a4a4';
    ctx.beginPath();
    ctx.arc(posX + circleSize / 2, bottomCircleY, circleSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#555';
    ctx.fillRect(posX + circleSize / 2 - 4 * scale, bottomCircleY - 6 * scale, 8 * scale, 12 * scale);

    posX += columnWidth + gap;

    // === Left Blinker ===
    ctx.fillStyle = seiData.blinker_on_left ? '#22c55e' : 'rgba(100, 100, 100, 0.3)';
    ctx.beginPath();
    ctx.moveTo(posX, centerY);
    ctx.lineTo(posX + blinkerWidth, centerY - 10 * scale);
    ctx.lineTo(posX + blinkerWidth, centerY + 10 * scale);
    ctx.closePath();
    ctx.fill();

    posX += blinkerWidth + gap;

    // === Speed Display ===
    const speed = seiData.vehicle_speed_mps
      ? speedUnit === 'mph'
        ? Math.round(seiData.vehicle_speed_mps * 2.23694)
        : Math.round(seiData.vehicle_speed_mps * 3.6)
      : 0;

    ctx.fillStyle = '#333';
    ctx.font = `600 ${32 * scale}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(speed), posX + speedWidth / 2, centerY - 8 * scale);

    ctx.fillStyle = '#666';
    ctx.font = `600 ${12 * scale}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillText(speedUnit.toUpperCase(), posX + speedWidth / 2, centerY + 18 * scale);

    posX += speedWidth + gap;

    // === Right Blinker ===
    ctx.fillStyle = seiData.blinker_on_right ? '#22c55e' : 'rgba(100, 100, 100, 0.3)';
    ctx.beginPath();
    ctx.moveTo(posX + blinkerWidth, centerY);
    ctx.lineTo(posX, centerY - 10 * scale);
    ctx.lineTo(posX, centerY + 10 * scale);
    ctx.closePath();
    ctx.fill();

    posX += blinkerWidth + gap;

    // === Right Column: Steering + Accelerator ===
    ctx.fillStyle = '#a4a4a4';
    ctx.beginPath();
    ctx.arc(posX + circleSize / 2, topCircleY, circleSize / 2, 0, Math.PI * 2);
    ctx.fill();

    // Steering wheel
    const steeringAngle = seiData.steering_wheel_angle || 0;
    ctx.save();
    ctx.translate(posX + circleSize / 2, topCircleY);
    ctx.rotate((steeringAngle * Math.PI) / 180);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.arc(0, 0, 8 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -8 * scale);
    ctx.lineTo(0, 8 * scale);
    ctx.stroke();
    ctx.restore();

    // Accelerator circle with fill
    const rawAccel = seiData.accelerator_pedal_position || 0;
    const accelPercent = Math.min(100, rawAccel > 1 ? rawAccel : rawAccel * 100);

    ctx.fillStyle = '#a4a4a4';
    ctx.beginPath();
    ctx.arc(posX + circleSize / 2, bottomCircleY, circleSize / 2, 0, Math.PI * 2);
    ctx.fill();

    if (accelPercent > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(posX + circleSize / 2, bottomCircleY, circleSize / 2, 0, Math.PI * 2);
      ctx.clip();
      const fillHeight = (accelPercent / 100) * circleSize;
      const gradient = ctx.createLinearGradient(0, bottomCircleY + circleSize / 2, 0, bottomCircleY - circleSize / 2);
      gradient.addColorStop(0, '#4caf50');
      gradient.addColorStop(1, '#8bc34a');
      ctx.fillStyle = gradient;
      ctx.fillRect(posX, bottomCircleY + circleSize / 2 - fillHeight, circleSize, fillHeight);
      ctx.restore();
    }

    ctx.fillStyle = '#555';
    ctx.fillRect(posX + circleSize / 2 - 4 * scale, bottomCircleY - 6 * scale, 8 * scale, 12 * scale);

    // === Autopilot label ===
    const isAutopilotActive = (seiData.autopilot_state ?? 0) > 0;
    if (isAutopilotActive) {
      const autopilotLabels: Record<number, string> = { 1: 'Self Driving', 2: 'Autosteer', 3: 'TACC' };
      const label = autopilotLabels[seiData.autopilot_state ?? 0] || '';
      if (label) {
        ctx.font = `600 ${11 * scale}px -apple-system, BlinkMacSystemFont, sans-serif`;
        const labelWidth = ctx.measureText(label).width + 24 * scale;
        const labelX = (width - labelWidth) / 2;
        const labelY = y + boxHeight - 1;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath();
        ctx.roundRect(labelX, labelY, labelWidth, 20 * scale, [0, 0, 8 * scale, 8 * scale]);
        ctx.fill();

        ctx.fillStyle = '#006deb';
        ctx.textAlign = 'center';
        ctx.fillText(label, width / 2, labelY + 12 * scale);
      }
    }
  };

  // Draw mini map with actual map tiles
  const drawMiniMap = async (
    ctx: CanvasRenderingContext2D,
    seiData: SeiData | null,
    width: number,
    height: number
  ) => {
    if (!seiData?.latitude_deg || !seiData?.longitude_deg) return;
    if (seiData.latitude_deg === 0 && seiData.longitude_deg === 0) return;

    const scale = Math.min(width / 1280, height / 720);
    const mapSize = 160 * scale;
    const padding = 12 * scale;
    const x = width - mapSize - padding;
    const y = height - mapSize - padding;

    const lat = seiData.latitude_deg;
    const lng = seiData.longitude_deg;
    const zoom = 17;

    // Get tile coordinates
    const tile = latLngToTile(lat, lng, zoom);
    const offset = latLngToPixelOffset(lat, lng, zoom);

    // Draw map background
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(x, y, mapSize, mapSize, 8 * scale);
    ctx.fill();

    // Clip to rounded rectangle
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, mapSize, mapSize, 8 * scale);
    ctx.clip();

    // Load and draw tiles (3x3 grid around center)
    const tileSize = 256;
    const centerX = x + mapSize / 2;
    const centerY = y + mapSize / 2;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const tileImg = await loadMapTile(tile.x + dx, tile.y + dy, zoom);
        if (tileImg) {
          const tileX = centerX - offset.px + dx * tileSize;
          const tileY = centerY - offset.py + dy * tileSize;
          ctx.drawImage(tileImg, tileX, tileY, tileSize, tileSize);
        }
      }
    }

    ctx.restore();

    // Draw car marker in center
    const heading = seiData.heading_deg || 0;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((heading * Math.PI) / 180);

    ctx.fillStyle = '#3B82F6';
    ctx.strokeStyle = '#1E40AF';
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.moveTo(0, -14 * scale);
    ctx.lineTo(-10 * scale, 10 * scale);
    ctx.lineTo(0, 5 * scale);
    ctx.lineTo(10 * scale, 10 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // Coordinates overlay at bottom
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    const coordBoxY = y + mapSize - 20 * scale;
    ctx.beginPath();
    ctx.roundRect(x, coordBoxY, mapSize, 20 * scale, [0, 0, 8 * scale, 8 * scale]);
    ctx.fill();

    const coordStr = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    ctx.fillStyle = '#94a3b8';
    ctx.font = `${10 * scale}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(coordStr, x + mapSize / 2, coordBoxY + 10 * scale);
  };

  const startExport = useCallback(async () => {
    if (!sequence || sequence.moments.length === 0) {
      alert('No video sequence to export');
      return;
    }

    if (typeof VideoEncoder === 'undefined') {
      alert('Your browser does not support video encoding. Please use Chrome or Edge.');
      return;
    }

    setIsExporting(true);
    setProgress(0);
    setExportUrl(null);
    abortRef.current = false;

    // Create a temporary video element for loading clips
    const tempVideo = document.createElement('video');
    tempVideo.muted = true;
    tempVideo.playsInline = true;
    let currentBlobUrl: string | null = null;

    // Helper to load a video file
    const loadVideo = (file: File): Promise<void> => {
      return new Promise((resolve, reject) => {
        // Revoke previous URL if any
        if (currentBlobUrl) {
          URL.revokeObjectURL(currentBlobUrl);
        }
        currentBlobUrl = URL.createObjectURL(file);
        tempVideo.src = currentBlobUrl;
        tempVideo.onloadedmetadata = () => {
          resolve();
        };
        tempVideo.onerror = () => {
          reject(new Error(`Failed to load ${file.name}`));
        };
      });
    };

    // Helper to seek video
    const seekVideo = (time: number): Promise<void> => {
      return new Promise((resolve) => {
        const onSeeked = () => {
          tempVideo.removeEventListener('seeked', onSeeked);
          resolve();
        };
        tempVideo.addEventListener('seeked', onSeeked);
        tempVideo.currentTime = time;
      });
    };

    try {
      // Get first clip to determine dimensions
      const firstMoment = sequence.moments[0];
      const firstVideo = firstMoment.videos.find(v => v.angle === selectedAngle) || firstMoment.videos[0];
      await loadVideo(firstVideo.file);

      const srcWidth = tempVideo.videoWidth || 1280;
      const srcHeight = tempVideo.videoHeight || 720;

      const maxDimension = 1920;
      let width = srcWidth;
      let height = srcHeight;

      if (width > maxDimension || height > maxDimension) {
        const videoScale = maxDimension / Math.max(width, height);
        width = Math.floor(width * videoScale);
        height = Math.floor(height * videoScale);
        width = width - (width % 2);
        height = height - (height % 2);
      }

      const exportFps = 30;
      const totalDuration = sequence.totalDuration;
      const totalFrames = Math.floor(totalDuration * exportFps);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;

      setStatus('Pre-loading map tiles...');

      // Pre-load map tiles for all unique positions
      const uniqueTiles = new Set<string>();
      for (const msg of allSeiMessages) {
        if (msg.sei.latitude_deg && msg.sei.longitude_deg) {
          const tile = latLngToTile(msg.sei.latitude_deg, msg.sei.longitude_deg, 17);
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              uniqueTiles.add(`17/${tile.x + dx}/${tile.y + dy}`);
            }
          }
        }
      }

      // Load tiles in batches
      const tileArray = Array.from(uniqueTiles);
      for (let i = 0; i < tileArray.length; i++) {
        const [z, x, y] = tileArray[i].split('/').map(Number);
        await loadMapTile(x, y, z);
        if (i % 10 === 0) {
          setStatus(`Pre-loading map tiles... ${Math.round((i / tileArray.length) * 100)}%`);
        }
      }

      setStatus('Initializing encoder...');

      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
          codec: 'avc',
          width,
          height,
        },
        fastStart: 'in-memory',
      });

      let encoderError: Error | null = null;
      const encoder = new VideoEncoder({
        output: (chunk, meta) => {
          muxer.addVideoChunk(chunk, meta);
        },
        error: (e) => {
          console.error('Encoder error:', e);
          encoderError = e;
        },
      });

      encoder.configure({
        codec: 'avc1.640033',
        width,
        height,
        bitrate: 8_000_000,
        framerate: exportFps,
        latencyMode: 'quality',
      });

      if ((encoder.state as string) === 'closed') {
        throw new Error('Video encoder failed to initialize');
      }

      // Process each clip in the sequence
      let frameCount = 0;
      for (let clipIdx = 0; clipIdx < sequence.moments.length; clipIdx++) {
        if (abortRef.current || encoderError) break;

        const moment = sequence.moments[clipIdx];
        const clipOffset = sequence.momentOffsets[clipIdx];
        const video = moment.videos.find(v => v.angle === selectedAngle) || moment.videos[0];

        setStatus(`Processing clip ${clipIdx + 1}/${sequence.moments.length}...`);

        // Load this clip
        await loadVideo(video.file);
        const clipDuration = tempVideo.duration;
        const clipFrames = Math.floor(clipDuration * exportFps);

        for (let i = 0; i < clipFrames; i++) {
          if (abortRef.current || encoderError) break;

          if ((encoder.state as string) === 'closed') {
            throw new Error('Encoder closed unexpectedly');
          }

          const localTime = i / exportFps;
          const absoluteTime = clipOffset + localTime;

          await seekVideo(localTime);
          await new Promise((r) => setTimeout(r, 10));

          // Draw video frame
          ctx.drawImage(tempVideo, 0, 0, width, height);

          // Get SEI data for this absolute time
          const seiData = getSeiForTime(absoluteTime);

          // Draw overlays
          drawTelemetry(ctx, seiData, width, height);
          await drawMiniMap(ctx, seiData, width, height);

          const frame = new VideoFrame(canvas, {
            timestamp: absoluteTime * 1_000_000,
            duration: (1 / exportFps) * 1_000_000,
          });

          encoder.encode(frame, { keyFrame: frameCount % 30 === 0 });
          frame.close();

          frameCount++;
          setProgress(Math.round((frameCount / totalFrames) * 90));
        }
      }

      if (encoderError) {
        throw encoderError;
      }

      if (abortRef.current) {
        if ((encoder.state as string) !== 'closed') {
          encoder.close();
        }
        setIsExporting(false);
        return;
      }

      setStatus('Finalizing...');

      if ((encoder.state as string) !== 'closed') {
        await encoder.flush();
        encoder.close();
      }
      muxer.finalize();

      const { buffer } = muxer.target;
      const blob = new Blob([buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      setExportUrl(url);
      setProgress(100);
      setStatus('Complete!');

    } catch (err) {
      console.error('Export error:', err);
      setStatus(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      // Cleanup
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
      }
      tempVideo.src = '';
      setIsExporting(false);
    }
  }, [sequence, selectedAngle, allSeiMessages, fps, speedUnit, getSeiForTime]);

  const stopExport = useCallback(() => {
    abortRef.current = true;
  }, []);

  const downloadExport = useCallback(() => {
    if (!exportUrl) return;

    const a = document.createElement('a');
    a.href = exportUrl;
    a.download = `${filename}-${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [exportUrl, filename]);

  return (
    <>
      <div className="flex items-center gap-2">
        {!isExporting && !exportUrl && (
          <button
            onClick={startExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-all"
            title="Export to MP4"
          >
            <IconDownload size={16} />
            <span className="hidden sm:inline">Export</span>
          </button>
        )}

        {exportUrl && !isExporting && (
          <div className="flex items-center gap-2">
            <button
              onClick={downloadExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-500 transition-all"
            >
              <IconDownload size={16} />
              <span>Download MP4</span>
            </button>
            <button
              onClick={() => setExportUrl(null)}
              className="p-1.5 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-all"
              title="Clear"
            >
              <IconX size={14} />
            </button>
          </div>
        )}
      </div>

      {isExporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl border border-gray-700">
            <div className="text-center">
              <div className="mb-6">
                <IconLoader2 size={48} className="animate-spin text-blue-500 mx-auto" />
              </div>

              <h3 className="text-xl font-semibold text-white mb-2">Exporting Video</h3>
              <p className="text-gray-400 mb-6">{status}</p>

              <div className="w-full bg-gray-700 rounded-full h-3 mb-4 overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <p className="text-2xl font-bold text-white mb-6">{Math.round(progress)}%</p>

              <button
                onClick={stopExport}
                className="flex items-center gap-2 mx-auto px-6 py-2.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 transition-all"
              >
                <IconPlayerStop size={18} />
                Cancel Export
              </button>

              {/* CTA */}
              <a
                href="https://nobig.deals"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 flex items-center gap-3 p-3 rounded-xl bg-gray-800/50 border border-gray-700 hover:border-gray-600 hover:bg-gray-800 transition-all"
              >
                <svg className="w-8 h-8 flex-shrink-0" viewBox="0 0 84 88" fill="none">
                  <path d="M33.241 68.7528C32.255 68.051 31.1554 67.5977 29.9415 67.3912C30.7378 67.129 31.4931 66.8013 32.2071 66.4057C33.6242 65.6425 34.7347 64.5737 35.5391 63.2C36.3816 61.8258 36.8029 60.1845 36.8029 58.2762C36.8029 56.3679 36.3054 54.5359 35.3096 53.0094C34.3134 51.4445 32.8392 50.2231 30.8862 49.3455C28.9712 48.4295 26.5965 47.9717 23.7628 47.9717H0V87.9315H24.5097C27.2671 87.9315 29.6224 87.4738 31.5754 86.5574C33.567 85.6414 35.0797 84.363 36.1136 82.7217C37.1861 81.0809 37.7225 79.2105 37.7225 77.1115C37.7225 75.3938 37.3203 73.81 36.5159 72.3594C35.7114 70.8709 34.6196 69.6688 33.241 68.7528ZM4.75917 54.4361H8.11589V54.4409L22.6134 54.4409C24.4898 54.4409 25.945 54.8802 26.9789 55.7577C28.0513 56.6358 28.5877 57.8758 28.5877 59.4791C28.5877 61.0823 28.0513 62.3608 26.9789 63.2004C25.945 64.04 24.4898 64.4598 22.6134 64.4598L8.04169 64.4598V59.4758C8.04169 59.0261 7.9983 58.5768 7.90019 58.1376C7.57785 56.6935 6.77222 55.6624 4.75876 55.6624L4.75917 54.4361ZM27.8984 80.0311C26.8264 80.9471 25.3133 81.4049 23.3602 81.4049H8.04169V75.6844C8.04169 75.2346 7.9983 74.7857 7.90059 74.3465C7.57826 72.9025 6.77222 71.8709 4.75917 71.8709V70.645H8.04169V70.6418L23.1879 70.6418C25.141 70.6418 26.6922 71.1384 27.8408 72.1307C28.9899 73.0847 29.5644 74.4205 29.5644 76.1381C29.5644 77.8557 29.0093 79.1152 27.8984 80.0311Z" fill="#EEE9E8"/>
                  <path d="M73.724 2.54189C70.6632 0.847296 67.2141 0 63.3757 0C59.5373 0 56.1372 0.847296 53.0278 2.54189C49.9184 4.23648 47.4411 6.63291 45.5947 9.73158C43.7973 12.7818 42.8984 16.4126 42.8984 20.6248C42.8984 24.837 43.773 28.4436 45.5217 31.5908C47.3191 34.689 49.7242 37.0859 52.7363 38.7804C55.7966 40.475 59.2218 41.3223 63.0112 41.3223C66.8005 41.3223 70.347 40.475 73.505 38.7804C76.6631 37.0859 79.1647 34.6894 81.0111 31.5908C82.9058 28.444 83.8533 24.7886 83.8533 20.6248C83.8533 16.4611 82.9301 12.7818 81.0841 9.73158C79.2867 6.63291 76.8334 4.23648 73.7244 2.54189H73.724ZM73.5054 28.1769C72.3398 30.162 70.8092 31.6627 68.9145 32.6793C67.0681 33.6474 65.1005 34.1314 63.0116 34.1314C60.9227 34.1314 58.9794 33.6474 57.182 32.6793C55.4329 31.6627 54.024 30.1616 52.9552 28.1769C51.8865 26.1433 51.3521 23.6261 51.3521 20.6244C51.3521 17.6227 51.9108 15.057 53.0282 13.0719C54.1456 11.0868 55.6028 9.61036 57.4006 8.64185C59.1979 7.67374 61.1417 7.18929 63.2305 7.18929C65.3194 7.18929 67.2627 7.67334 69.0601 8.64185C70.9065 9.60996 72.4123 11.0868 73.5784 13.0719C74.7441 15.057 75.3275 17.5742 75.3275 20.6244C75.3275 23.6746 74.7202 26.1437 73.5054 28.1769Z" fill="#EEE9E8"/>
                  <path d="M28.6122 2.07802C26.143 0.775354 23.3349 0.124023 20.1882 0.124023C18.5088 0.124023 16.9012 0.353929 15.3657 0.812931C12.7291 1.7269 10.3029 3.1839 9.5374 5.76014H8.28658V5.33265C8.28415 5.33588 8.28172 5.33871 8.27888 5.34194V0.775354H0V40.6508H8.27847V18.3613C8.27847 15.9006 8.69001 13.8505 9.51307 12.21C10.3844 10.5696 11.5707 9.33922 13.0713 8.519C14.5723 7.69877 16.3392 7.28866 18.3726 7.28866C21.3741 7.28866 23.7946 8.2297 25.6342 10.111C27.4737 11.9441 28.3941 14.6945 28.3941 18.3609V40.6504H36.6V17.1309C36.6 13.4161 35.8734 10.3041 34.4211 7.79534C33.017 5.23851 31.0806 3.3326 28.6118 2.07802H28.6122Z" fill="#EEE9E8"/>
                  <path d="M73.9775 50.4019C70.8288 48.7562 67.1035 47.9336 62.8025 47.9336H46.1484V88.0001H62.8025C67.1035 88.0001 70.8283 87.1779 73.9775 85.5322C77.1643 83.8865 79.6222 81.5713 81.3502 78.5865C83.1167 75.6018 83.9998 72.0809 83.9998 68.0246C83.9998 63.9684 83.1167 60.4285 81.3502 57.4054C79.6222 54.3823 77.1647 52.0472 73.9775 50.4019ZM72.3066 77.7255C70.041 80.0217 66.7771 81.1697 62.5146 81.1697H54.2124V59.7658C54.2124 59.3149 54.1691 58.8644 54.0705 58.4244C53.747 56.9767 52.9389 55.9427 50.921 55.9427V54.7136H54.2124V54.7075H62.5146C66.7771 54.7075 70.041 55.8938 72.3066 58.2664C74.6108 60.639 75.7631 63.892 75.7631 68.0251C75.7631 72.1581 74.6108 75.3909 72.3066 77.7255Z" fill="#EEE9E8"/>
                </svg>
                <div className="text-left">
                  <p className="text-xs text-gray-400">Got an idea? Looking for an AI-native team?</p>
                  <p className="text-sm text-gray-300 font-medium">we are nobig.deals ready to help you →</p>
                </div>
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
