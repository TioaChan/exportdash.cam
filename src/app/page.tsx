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
              <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800 relative overflow-hidden">
                <img
                  src="/features/playback.png"
                  alt=""
                  className="absolute -right-2 top-1 w-28 rotate-6 opacity-100 pointer-events-none rounded-lg shadow-lg"
                />
                <div className="relative z-10">
                  <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold mb-1">Seamless Playback</h3>
                  <p className="text-sm text-gray-500">Consecutive clips merged into continuous video</p>
                </div>
              </div>

              {/* Live Telemetry */}
              <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800 relative overflow-hidden">
                <img
                  src="/features/telemetry.png"
                  alt=""
                  className="absolute -right-2 top-1 w-28 rotate-6 opacity-100 pointer-events-none rounded-lg shadow-lg"
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
              <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800 relative overflow-hidden">
                <img
                  src="/features/cameras.png"
                  alt=""
                  className="absolute -right-4 -top-1 w-32 rotate-6 opacity-100 pointer-events-none rounded-lg shadow-lg"
                />
                <div className="relative z-10">
                  <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </div>
                  <h3 className="font-semibold mb-1">All 6 Cameras</h3>
                  <p className="text-sm text-gray-500">Front, rear, repeaters, and pillars with flexible layouts</p>
                </div>
              </div>

              {/* Interactive Map */}
              <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800 relative overflow-hidden">
                <img
                  src="/features/map.png"
                  alt=""
                  className="absolute -right-4 -top-2 w-24 rotate-6 opacity-100 pointer-events-none rounded-lg"
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
                  className="absolute -right-6 top-1 w-28 rotate-6 opacity-100 pointer-events-none rounded-lg"
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
              <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800 relative overflow-hidden">
                <svg className="absolute -right-2 top-2 w-20 h-20 rotate-6 opacity-20 pointer-events-none" fill="currentColor" viewBox="0 0 14 14">
                  <path d="m 2.17819,10.265823 0,-0.9907999 0.13389,0 0.13389,0 0,0.8836999 0,0.8837 0.48201,0 c 0.4463,0 0.482,0.01 0.482,0.1071 0,0.1009 -0.0357,0.1071 -0.6159,0.1071 l -0.61589,0 0,-0.9908 z m 1.55313,0.241 c 0,-0.7140999 0.005,-0.7497999 0.10711,-0.7497999 0.10201,0 0.10711,0.036 0.10711,0.7497999 0,0.7141 -0.005,0.7498 -0.10711,0.7498 -0.10201,0 -0.10711,-0.036 -0.10711,-0.7498 z m 0.77785,0.6221 c -0.2744,-0.2744 -0.29805,-0.9124 -0.045,-1.2131999 0.1408,-0.1673 0.40799,-0.2466 0.63705,-0.1892 0.16627,0.042 0.39742,0.2606 0.39742,0.3761999 0,0.1319 -0.23394,0.102 -0.29525,-0.038 C 5.14749,9.9373231 4.97978,9.8882231 4.77553,9.9394231 c -0.34021,0.085 -0.30196,1.0449999 0.0451,1.1320999 0.15582,0.039 0.33125,-0.043 0.41085,-0.1913 0.0678,-0.1266 0.26713,-0.1426 0.26713,-0.021 0,0.046 -0.0704,0.1549 -0.15655,0.241 -0.13228,0.1322 -0.19908,0.1565 -0.43089,0.1565 -0.21769,0 -0.30071,-0.026 -0.40207,-0.1277 z m 1.41842,-0.024 c -0.28083,-0.2809 -0.28184,-0.8895 -0.002,-1.2026999 0.13728,-0.1537 0.18423,-0.1717 0.44673,-0.1717 0.21758,0 0.32435,0.028 0.41346,0.1071 0.14306,0.1275 0.26601,0.3989999 0.26601,0.5873999 l 0,0.1356 -0.54226,0 -0.54225,0 0.0336,0.174 c 0.0653,0.338 0.41882,0.4682 0.6906,0.2544 0.1667,-0.1311 0.33238,-0.1441 0.28567,-0.022 -0.0179,0.047 -0.0325,0.094 -0.0325,0.1058 0,0.072 -0.35923,0.1844 -0.59057,0.1844 -0.23017,0 -0.29914,-0.025 -0.42653,-0.1519 z m 0.85644,-0.8156 c 0,-0.081 -0.11188,-0.2835 -0.18208,-0.3303999 -0.0324,-0.022 -0.13123,-0.039 -0.2196,-0.039 -0.19039,0 -0.25739,0.039 -0.34009,0.1956999 -0.11035,0.2097 -0.0787,0.2312 0.34009,0.2312 0.2486,0 0.40168,-0.022 0.40168,-0.057 z m 0.58911,0.2177 c 0,-0.7140999 0.005,-0.7497999 0.10712,-0.7497999 0.0729,0 0.10711,0.036 0.10711,0.1119 0,0.1077 0.006,0.1067 0.16478,-0.027 0.2179,-0.1833 0.4887,-0.1862 0.66778,-0.01 0.12502,0.1251 0.13145,0.1631 0.13145,0.7765999 0,0.6094 -0.006,0.6451 -0.10711,0.6451 -0.0999,0 -0.10711,-0.036 -0.10711,-0.5321 0,-0.6995 -0.0415,-0.8067999 -0.31171,-0.8067999 -0.33435,0 -0.3977,0.1152999 -0.42714,0.7770999 -0.0224,0.5041 -0.0353,0.5618 -0.12507,0.5618 -0.093,0 -0.1001,-0.053 -0.1001,-0.7498 z m 1.67975,0.6872 c -0.0629,-0.031 -0.14073,-0.1132 -0.17291,-0.1838 -0.051,-0.112 -0.045,-0.1285 0.0474,-0.1285 0.0583,0 0.15417,0.048 0.21308,0.1071 0.0696,0.07 0.17852,0.1071 0.3111,0.1071 0.26123,0 0.40088,-0.1003 0.37683,-0.2707 -0.0146,-0.1034 -0.0691,-0.1457 -0.25948,-0.2011 -0.41588,-0.1211 -0.58972,-0.219 -0.64444,-0.3629 -0.16714,-0.4395999 0.56396,-0.7245999 0.99302,-0.3870999 0.15587,0.1226 0.16723,0.1797999 0.045,0.2266999 -0.0539,0.021 -0.12792,-0.01 -0.18953,-0.075 -0.12092,-0.1296999 -0.4788,-0.1487999 -0.57682,-0.031 -0.12901,0.1553999 -0.0392,0.2581999 0.33033,0.3779999 0.45527,0.1476 0.52463,0.2069 0.52362,0.4478 -9.5e-4,0.2244 -0.0347,0.2886 -0.1965,0.3737 -0.14314,0.075 -0.64433,0.075 -0.80075,0 z m 1.54524,-0.021 c -0.27054,-0.1895 -0.36678,-0.7282 -0.20098,-1.1251 0.14985,-0.3585999 0.74687,-0.4538999 1.03549,-0.1652999 0.12384,0.1237999 0.25074,0.5805999 0.18075,0.6505999 -0.0149,0.015 -0.25209,0.027 -0.52701,0.027 -0.49986,0 -0.49986,0 -0.49986,0.1363 0,0.3247 0.46751,0.5208 0.69623,0.2921 0.0589,-0.059 0.14326,-0.1071 0.18745,-0.1071 0.12664,0 0.0939,0.1423 -0.0608,0.2639 -0.17483,0.1375 -0.63203,0.153 -0.81129,0.027 z m 0.77069,-0.9116 c -0.0179,-0.047 -0.0325,-0.1051 -0.0325,-0.13 0,-0.1094 -0.18336,-0.2136999 -0.37569,-0.2136999 -0.21896,0 -0.3741,0.1381999 -0.3741,0.3332999 0,0.083 0.0527,0.095 0.4074,0.095 0.3495,0 0.40278,-0.012 0.3749,-0.085 z M 3.73132,9.3020231 c 0,-0.098 0.0286,-0.1339 0.10711,-0.1339 0.0786,0 0.10711,0.036 0.10711,0.1339 0,0.098 -0.0286,0.1339 -0.10711,0.1339 -0.0786,0 -0.10711,-0.036 -0.10711,-0.1339 z m -2.08869,-1.0711 0,-0.2946 -0.32134,0 -0.32134,0 0,-0.2945 0,-0.2946 0.32134,0 0.32134,0 0,-0.2946 0,-0.2945 -0.32134,0 -0.32134,0 0,-2.0084 0,-2.0083 2.54392,0 2.54392,0 0,2.0057 0,2.0056 -0.30794,0.016 -0.30795,0.016 -0.0162,0.2811 -0.0162,0.2812 0.32414,0 0.32413,0 0,0.2946 0,0.2945 -0.32133,0 -0.32134,0 0,0.2946 0,0.2945 -0.32134,0 -0.32134,0 0,-0.2945 0,-0.2946 0.32134,0 0.32134,0 0,-0.2945 0,-0.2946 -0.32414,0 -0.32413,0 0.0162,-0.2812 0.0162,-0.2811 0.30795,-0.016 0.30795,-0.016 0,-0.2624 0,-0.2624 -0.30795,-0.016 -0.30795,-0.016 -0.0145,-1.0845 -0.0145,-1.0845 -0.37379,0 -0.37378,0 0,2.2494 0,2.2493 -0.48201,0 -0.48201,0 0,-2.2493 0,-2.2494 -0.40167,0 -0.40167,0 0,1.0979 0,1.0979 -0.32134,0 -0.32133,0 0,0.2678 0,0.2678 0.32133,0 0.32134,0 0,0.2945 0,0.2946 -0.32134,0 -0.32133,0 0,0.2946 0,0.2945 0.32133,0 0.32134,0 0,0.2946 0,0.2945 -0.32134,0 -0.32133,0 0,-0.2945 z m 5.19495,-2.5975 0,-2.892 0.64268,0 0.64267,0 0,2.892 0,2.892 -0.64267,0 -0.64268,0 0,-2.892 z m 4.07028,2.5975 0,-0.2946 -0.29456,0 -0.29456,0 0,-0.2945 0,-0.2946 0.29456,0 0.29456,0 0,-0.2946 0,-0.2945 -0.30795,0 -0.30795,1e-4 0.0152,-1.3658 0.0152,-1.3657 -0.72477,0 -0.72477,0 0,-0.6427 0,-0.6426 2.06361,0 2.06362,0 -0.0151,0.6293 -0.0151,0.6292 -0.70962,0.015 -0.70962,0.015 0,1.0964 0,1.0963 -0.32427,0 -0.32427,0 0.0163,0.2544 0.0163,0.2544 0.30794,0.016 0.30795,0.016 0,0.2892 0,0.2893 -0.30795,0.016 -0.30794,0.016 0,0.2678 0,0.2677 0.30794,0.016 0.30795,0.016 0,0.2919 0,0.2918 -0.32134,0 -0.32133,0 0,-0.2945 z"/>
                </svg>
                <div className="relative z-10">
                  <div className="w-10 h-10 rounded-lg bg-pink-600/20 flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </div>
                  <h3 className="font-semibold mb-1">Open Source</h3>
                  <p className="text-sm text-gray-500">MIT licensed. View and contribute on GitHub.</p>
                </div>
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
                  <svg className="w-3.5 h-3.5 inline" viewBox="0 0 248 248" fill="none">
                    <path d="M52.4285 162.873L98.7844 136.879L99.5485 134.602L98.7844 133.334H96.4921L88.7237 132.862L62.2346 132.153L39.3113 131.207L17.0249 130.026L11.4214 128.844L6.2 121.873L6.7094 118.447L11.4214 115.257L18.171 115.847L33.0711 116.911L55.485 118.447L71.6586 119.392L95.728 121.873H99.5485L100.058 120.337L98.7844 119.392L97.7656 118.447L74.5877 102.732L49.4995 86.1905L36.3823 76.62L29.3779 71.7757L25.8121 67.2858L24.2839 57.3608L30.6515 50.2716L39.3113 50.8623L41.4763 51.4531L50.2636 58.1879L68.9842 72.7209L93.4357 90.6804L97.0015 93.6343L98.4374 92.6652L98.6571 91.9801L97.0015 89.2625L83.757 65.2772L69.621 40.8192L63.2534 30.6579L61.5978 24.632C60.9565 22.1032 60.579 20.0111 60.579 17.4246L67.8381 7.49965L71.9133 6.19995L81.7193 7.49965L85.7946 11.0443L91.9074 24.9865L101.714 46.8451L116.996 76.62L121.453 85.4816L123.873 93.6343L124.764 96.1155H126.292V94.6976L127.566 77.9197L129.858 57.3608L132.15 30.8942L132.915 23.4505L136.608 14.4708L143.994 9.62643L149.725 12.344L154.437 19.0788L153.8 23.4505L150.998 41.6463L145.522 70.1215L141.957 89.2625H143.994L146.414 86.7813L156.093 74.0206L172.266 53.698L179.398 45.6635L187.803 36.802L193.152 32.5484H203.34L210.726 43.6549L207.415 55.1159L196.972 68.3492L188.312 79.5739L175.896 96.2095L168.191 109.585L168.882 110.689L170.738 110.53L198.755 104.504L213.91 101.787L231.994 98.7149L240.144 102.496L241.036 106.395L237.852 114.311L218.495 119.037L195.826 123.645L162.07 131.592L161.696 131.893L162.137 132.547L177.36 133.925L183.855 134.279H199.774L229.447 136.524L237.215 141.605L241.8 147.867L241.036 152.711L229.065 158.737L213.019 154.956L175.45 145.977L162.587 142.787H160.805V143.85L171.502 154.366L191.242 172.089L215.82 195.011L217.094 200.682L213.91 205.172L210.599 204.699L188.949 188.394L180.544 181.069L161.696 165.118H160.422V166.772L164.752 173.152L187.803 207.771L188.949 218.405L187.294 221.832L181.308 223.959L174.813 222.777L161.187 203.754L147.305 182.486L136.098 163.345L134.745 164.2L128.075 235.42L125.019 239.082L117.887 241.8L111.902 237.31L108.718 229.984L111.902 215.452L115.722 196.547L118.779 181.541L121.58 162.873L123.291 156.636L123.14 156.219L121.773 156.449L107.699 175.752L86.304 204.699L69.3663 222.777L65.291 224.431L58.2867 220.768L58.9235 214.27L62.8713 208.48L86.304 178.705L100.44 160.155L109.551 149.507L109.462 147.967L108.959 147.924L46.6977 188.512L35.6182 189.93L30.7788 185.44L31.4156 178.115L33.7079 175.752L52.4285 162.873Z" fill="#D97757"/>
                  </svg>
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
