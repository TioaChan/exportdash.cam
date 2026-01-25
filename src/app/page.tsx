'use client';

import { useState, useCallback } from 'react';
import { DropZone } from '@/components/DropZone';
import { VideoPlayer } from '@/components/VideoPlayer';
import { LoadingScreen } from '@/components/LoadingScreen';
import { VideoSequence, ProcessingProgress } from '@/types/video';
import { processFilesToMoments, detectSequences } from '@/lib/sequence-detector';

export default function Home() {
  const [sequences, setSequences] = useState<VideoSequence[]>([]);
  const [selectedSequence, setSelectedSequence] = useState<VideoSequence | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress>({
    stage: 'scanning',
    current: 0,
    total: 0,
  });

  const handleFilesAdded = useCallback(async (newFiles: File[]) => {
    if (newFiles.length === 0) return;

    // Start processing
    setIsProcessing(true);
    setProcessingProgress({
      stage: 'scanning',
      current: 0,
      total: newFiles.length,
      message: 'Scanning files...',
    });

    try {
      // Process files into moments
      const moments = await processFilesToMoments(newFiles, setProcessingProgress);

      // Detect sequences from moments
      const detectedSequences = detectSequences(moments);

      // Update state
      setSequences(detectedSequences);

      // Auto-select first sequence if none selected
      if (detectedSequences.length > 0) {
        setSelectedSequence(detectedSequences[0]);
      }
    } catch (error) {
      console.error('Error processing videos:', error);
      setProcessingProgress({
        stage: 'error',
        current: 0,
        total: newFiles.length,
        message: 'Error processing videos',
      });
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleClear = useCallback(() => {
    setSequences([]);
    setSelectedSequence(null);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Loading Screen */}
      {isProcessing && <LoadingScreen progress={processingProgress} />}

      {/* Main Content - Full width, no header */}
      <main className="p-4">
        {sequences.length === 0 ? (
          /* Empty State */
          <div className="max-w-4xl mx-auto">
            <DropZone onFilesAdded={handleFilesAdded} hasVideos={false} />

            {/* Features */}
            <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Privacy First */}
              <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800">
                <div className="w-10 h-10 rounded-lg bg-emerald-600/20 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h3 className="font-semibold mb-1">100% Private</h3>
                <p className="text-sm text-gray-500">Everything runs in your browser. No uploads, no servers, no tracking.</p>
              </div>

              {/* Seamless Playback */}
              <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800">
                <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="font-semibold mb-1">Seamless Playback</h3>
                <p className="text-sm text-gray-500">Consecutive clips merged into continuous video</p>
              </div>

              {/* Live Telemetry */}
              <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800 relative overflow-hidden">
                <img
                  src="/features/telemetry.png"
                  alt=""
                  className="absolute -right-4 -top-2 w-24 rotate-6 opacity-60 pointer-events-none"
                />
                <div className="relative z-10">
                  <div className="w-10 h-10 rounded-lg bg-yellow-600/20 flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold mb-1">Live Telemetry</h3>
                  <p className="text-sm text-gray-500">Speed, GPS, steering angle, and G-forces overlaid in real-time</p>
                </div>
              </div>

              {/* All 6 Cameras */}
              <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800">
                <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </div>
                <h3 className="font-semibold mb-1">All 6 Cameras</h3>
                <p className="text-sm text-gray-500">Front, rear, repeaters, and pillars with flexible layouts</p>
              </div>

              {/* Interactive Map */}
              <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800 relative overflow-hidden">
                <img
                  src="/features/map.png"
                  alt=""
                  className="absolute -right-4 -top-2 w-24 rotate-6 opacity-60 pointer-events-none rounded-lg"
                />
                <div className="relative z-10">
                  <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold mb-1">Interactive Map</h3>
                  <p className="text-sm text-gray-500">Live GPS tracking synced with video playback</p>
                </div>
              </div>

              {/* Event Timeline */}
              <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800 relative overflow-hidden">
                <img
                  src="/features/timeline.png"
                  alt=""
                  className="absolute -right-6 top-1 w-28 rotate-6 opacity-60 pointer-events-none rounded-lg"
                />
                <div className="relative z-10">
                  <div className="w-10 h-10 rounded-lg bg-orange-600/20 flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold mb-1">Event Timeline</h3>
                  <p className="text-sm text-gray-500">Visual timeline showing brake, gas, blinkers, and steering</p>
                </div>
              </div>

              {/* Video Export */}
              <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800">
                <div className="w-10 h-10 rounded-lg bg-red-600/20 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
                <h3 className="font-semibold mb-1">Video Export</h3>
                <p className="text-sm text-gray-500">Export clips with telemetry overlay burned in</p>
              </div>

              {/* Keyboard Shortcuts */}
              <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800">
                <div className="w-10 h-10 rounded-lg bg-cyan-600/20 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                </div>
                <h3 className="font-semibold mb-1">Keyboard Shortcuts</h3>
                <p className="text-sm text-gray-500">Space, arrows, 1-4 for layouts, T/M for overlays</p>
              </div>

              {/* Open Source */}
              <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800">
                <div className="w-10 h-10 rounded-lg bg-pink-600/20 flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                </div>
                <h3 className="font-semibold mb-1">Open Source</h3>
                <p className="text-sm text-gray-500">MIT licensed. View and contribute on GitHub.</p>
              </div>
            </div>

            {/* Credits */}
            <div className="mt-16 pt-8 border-t border-gray-800 text-center">
              <p className="text-xs text-gray-600">
                100% built with{' '}
                <a
                  href="https://claude.ai/code"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-500 hover:text-gray-400 inline-flex items-center gap-1"
                >
                  <img src="https://claude.ai/favicon.svg" alt="Claude" className="w-3.5 h-3.5 inline" />
                  Claude Code
                </a>
                {' '}· Uses{' '}
                <a
                  href="https://github.com/teslamotors/dashcam"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-500 hover:text-gray-400 underline underline-offset-2"
                >
                  Tesla&apos;s SEI metadata spec
                </a>
                {' '}· Inspired by{' '}
                <a
                  href="https://viewdash.cam/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-500 hover:text-gray-400 underline underline-offset-2"
                >
                  ViewDash.cam
                </a>
                {' '}(
                <a
                  href="https://github.com/pixeye33/viewdashcam"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-500 hover:text-gray-400 underline underline-offset-2"
                >
                  source
                </a>
                )
              </p>
            </div>
          </div>
        ) : (
          /* Full-width Video Player with integrated controls */
          <VideoPlayer
            sequences={sequences}
            selectedSequence={selectedSequence}
            onSelectSequence={setSelectedSequence}
            onClear={handleClear}
            onAddFiles={handleFilesAdded}
          />
        )}
      </main>
    </div>
  );
}
