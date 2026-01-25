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
          <div className="max-w-2xl mx-auto">
            <DropZone onFilesAdded={handleFilesAdded} hasVideos={false} />

            {/* Features */}
            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-800">
                <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="font-semibold mb-2">Seamless Playback</h3>
                <p className="text-sm text-gray-500">Consecutive 1-minute clips merged into continuous video</p>
              </div>

              <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-800">
                <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="font-semibold mb-2">Live Telemetry</h3>
                <p className="text-sm text-gray-500">Speed, GPS, steering angle, and G-forces overlaid in real-time</p>
              </div>

              <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-800">
                <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </div>
                <h3 className="font-semibold mb-2">All 6 Cameras</h3>
                <p className="text-sm text-gray-500">Front, rear, sides, and pillars with flexible layouts</p>
              </div>
            </div>

            {/* Credits */}
            <div className="mt-16 pt-8 border-t border-gray-800 text-center">
              <p className="text-xs text-gray-600">
                Built with{' '}
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
