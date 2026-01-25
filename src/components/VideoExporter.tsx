'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { IconDownload, IconPlayerStop, IconLoader2, IconX } from '@tabler/icons-react';
import { SeiData, SeiWithFrameIndex } from '@/lib/dashcam-mp4';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

interface VideoExporterProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
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
  videoRef,
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
    if (!videoRef.current) return;

    const video = videoRef.current;

    if (!video.duration || video.duration === Infinity) {
      alert('Video not ready');
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

    try {
      // Get video dimensions - scale down if too large
      const srcWidth = video.videoWidth || 1280;
      const srcHeight = video.videoHeight || 720;

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
      const duration = video.duration;
      const totalFrames = Math.floor(duration * exportFps);

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

      setStatus('Capturing frames...');

      const wasPlaying = !video.paused;
      video.pause();
      const originalTime = video.currentTime;

      for (let i = 0; i < totalFrames; i++) {
        if (abortRef.current || encoderError) break;

        if ((encoder.state as string) === 'closed') {
          throw new Error('Encoder closed unexpectedly');
        }

        const frameTime = i / exportFps;
        video.currentTime = frameTime;

        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          video.addEventListener('seeked', onSeeked);
        });

        await new Promise((r) => setTimeout(r, 10));

        // Draw video frame
        ctx.drawImage(video, 0, 0, width, height);

        // Get SEI data for this specific frame time
        const seiData = getSeiForTime(frameTime);

        // Draw overlays
        drawTelemetry(ctx, seiData, width, height);
        await drawMiniMap(ctx, seiData, width, height);

        const frame = new VideoFrame(canvas, {
          timestamp: frameTime * 1_000_000,
          duration: (1 / exportFps) * 1_000_000,
        });

        encoder.encode(frame, { keyFrame: i % 30 === 0 });
        frame.close();

        setProgress(Math.round(((i + 1) / totalFrames) * 90));
      }

      if (encoderError) {
        throw encoderError;
      }

      if (abortRef.current) {
        if ((encoder.state as string) !== 'closed') {
          encoder.close();
        }
        video.currentTime = originalTime;
        if (wasPlaying) video.play();
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

      video.currentTime = originalTime;
      if (wasPlaying) video.play();

    } catch (err) {
      console.error('Export error:', err);
      setStatus(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  }, [videoRef, allSeiMessages, fps, speedUnit, getSeiForTime]);

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
            </div>
          </div>
        </div>
      )}
    </>
  );
}
