import type { ClipItem, CompressionProfile, CompressionProfileConfig } from '../types/video';
import { drawPlayerOverlay } from './playerOverlay';
import { isWebCodecsSupported, processClipWithWebCodecs } from './webCodecsProcessor';
import { processClipLossless, clipRequiresReencoding, clearParsedMP4Cache } from './losslessProcessor';

export { clipRequiresReencoding, clearParsedMP4Cache };

export const COMPRESSION_PROFILES: Record<CompressionProfile, CompressionProfileConfig> = {
  original: {
    id: 'original',
    label: 'Original / High Quality',
    description: 'Preserves native resolution & maximum bitrate. Best visual fidelity.',
    videoBitrate: 8_000_000, // 8 Mbps
    audioBitrate: 192_000,   // 192 kbps
    maxDimension: 3840,
    crfEstimateMultiplier: 1.0
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced (Fast 1080p)',
    description: 'Crisp 1080p output with efficient bitrate. Ideal for social media sharing.',
    videoBitrate: 3_500_000, // 3.5 Mbps
    audioBitrate: 128_000,   // 128 kbps
    maxDimension: 1920,
    crfEstimateMultiplier: 0.55
  },
  small: {
    id: 'small',
    label: 'Turbo / Fast (720p)',
    description: 'Ultra-fast lightweight 720p encoding. Lowest CPU/GPU load and fastest export.',
    videoBitrate: 1_400_000, // 1.4 Mbps
    audioBitrate: 96_000,    // 96 kbps
    maxDimension: 1280,
    crfEstimateMultiplier: 0.28
  }
};

/**
 * Estimates output file size in bytes for a given duration and profile.
 */
export function estimateClipSizeBytes(durationSec: number, profile: CompressionProfile): number {
  const config = COMPRESSION_PROFILES[profile];
  const totalBitrate = config.videoBitrate + config.audioBitrate;
  // bytes = (bps * sec) / 8 * 1.05 (container overhead)
  return Math.round((totalBitrate * durationSec) / 8 * 1.05);
}

/**
 * Finds the best supported MIME type for MediaRecorder.
 */
export function getSupportedMimeType(): { mimeType: string; extension: string } {
  const candidates = [
    { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4;codecs=avc1', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' }
  ];

  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mime)) {
      return { mimeType: c.mime, extension: c.ext };
    }
  }

  return { mimeType: 'video/webm', extension: 'webm' };
}

export type EncodingEngine = 'lossless' | 'webcodecs' | 'mediarecorder';

export interface ProcessClipOptions {
  sourceUrl: string;
  sourceFile?: File;
  clip: ClipItem;
  profile: CompressionProfile;
  engine?: EncodingEngine;
  playbackRate?: number;
  signal?: AbortSignal;
  onProgress?: (progressPercent: number) => void;
}

/**
 * Main export processor.
 * 1. Instant Lossless Stream Copy (0.05s / Zero Re-encoding) when selected and supported.
 * 2. Turbo WebCodecs GPU Hardware Encoding (up to 8x speed) when visual overlays/crops are needed.
 * 3. MediaRecorder universal fallback.
 */
export async function processClip(
  options: ProcessClipOptions
): Promise<{ blob: Blob; mimeType: string; extension: string }> {
  // 1. Instant Lossless (0.05s) mode
  if (options.engine === 'lossless' && options.sourceFile) {
    try {
      return await processClipLossless({
        sourceFile: options.sourceFile,
        clip: options.clip,
        signal: options.signal,
        onProgress: options.onProgress
      });
    } catch (err: unknown) {
      if (options.signal?.aborted) throw err;
      console.warn('Lossless stream copy failed, falling back to WebCodecs:', err);
    }
  }

  // 2. Turbo WebCodecs GPU Hardware Encoding
  if (options.engine !== 'mediarecorder' && isWebCodecsSupported()) {
    try {
      return await processClipWithWebCodecs({
        ...options,
        playbackRate: options.playbackRate ?? 6.0
      });
    } catch (err: unknown) {
      if (options.signal?.aborted) throw err;
      console.warn('WebCodecs execution failed, falling back to MediaRecorder:', err);
    }
  }

  // 3. Fallback to MediaRecorder
  return processClipWithMediaRecorder(options);
}

/**
 * MediaRecorder fallback processor.
 */
export async function processClipWithMediaRecorder({
  sourceUrl,
  clip,
  profile,
  signal,
  onProgress
}: ProcessClipOptions): Promise<{ blob: Blob; mimeType: string; extension: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException('Aborted by user', 'AbortError'));
    }

    const { edits, startTime, endTime } = clip;
    const duration = Math.min(90.0, Math.max(0.5, endTime - startTime));
    const targetEnd = startTime + duration;
    const config = COMPRESSION_PROFILES[profile];
    const { mimeType, extension } = getSupportedMimeType();

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = edits.mute;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    let animFrameId: number | null = null;
    let backupTimerId: number | null = null;
    let mediaRecorder: MediaRecorder | null = null;
    const recordedChunks: Blob[] = [];
    let audioContext: AudioContext | null = null;

    const cleanup = () => {
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      if (backupTimerId) {
        clearTimeout(backupTimerId);
        backupTimerId = null;
      }
      if (audioContext && audioContext.state !== 'closed') {
        try {
          audioContext.close();
        } catch {
          // ignore
        }
      }
      video.pause();
      video.removeAttribute('src');
      video.load();
    };

    const handleAbort = () => {
      cleanup();
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try {
          mediaRecorder.stop();
        } catch {
          // ignore
        }
      }
      reject(new DOMException('Processing cancelled by user', 'AbortError'));
    };

    if (signal) {
      signal.addEventListener('abort', handleAbort, { once: true });
    }

    video.onerror = () => {
      cleanup();
      reject(new Error(`Failed to load video source for clip #${clip.originalIndex + 1}`));
    };

    video.onloadedmetadata = () => {
      try {
        let srcW = video.videoWidth || 1280;
        let srcH = video.videoHeight || 720;

        // Calculate Crop Coordinates
        let sx = 0;
        let sy = 0;
        let sw = srcW;
        let sh = srcH;

        if (edits.crop) {
          sx = Math.max(0, Math.min(srcW - 10, edits.crop.x));
          sy = Math.max(0, Math.min(srcH - 10, edits.crop.y));
          sw = Math.min(srcW - sx, edits.crop.width);
          sh = Math.min(srcH - sy, edits.crop.height);
        }

        // Adjust for Rotation (90 or 270 degrees swap width & height)
        const isRotated90 = edits.rotation === 90 || edits.rotation === 270;
        let outW = isRotated90 ? sh : sw;
        let outH = isRotated90 ? sw : sh;

        // Downscale if exceeds maxDimension for balanced or small profile
        if (config.maxDimension) {
          const maxDim = Math.max(outW, outH);
          if (maxDim > config.maxDimension) {
            const scale = config.maxDimension / maxDim;
            outW = Math.round((outW * scale) / 2) * 2; // Even dimensions
            outH = Math.round((outH * scale) / 2) * 2;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(160, outW);
        canvas.height = Math.max(160, outH);
        const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

        if (!ctx) {
          cleanup();
          return reject(new Error('Canvas 2D context creation failed.'));
        }

        // Setup Audio & Canvas Stream
        const canvasStream = canvas.captureStream(30); // 30 FPS target
        let combinedStream = canvasStream;

        if (!edits.mute) {
          try {
            const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            audioContext = new AudioCtx();
            const sourceNode = audioContext.createMediaElementSource(video);
            const destNode = audioContext.createMediaStreamDestination();
            sourceNode.connect(destNode);
            // Also connect to destination if we want user preview, but here video element is offscreen
            const audioTrack = destNode.stream.getAudioTracks()[0];
            if (audioTrack) {
              combinedStream.addTrack(audioTrack);
            }
          } catch (audioErr) {
            console.warn('Could not capture audio stream, proceeding with muted video:', audioErr);
          }
        }

        try {
          mediaRecorder = new MediaRecorder(combinedStream, {
            mimeType: mimeType,
            videoBitsPerSecond: config.videoBitrate,
            audioBitsPerSecond: config.audioBitrate
          });
        } catch {
          // Fallback to default MediaRecorder without options
          mediaRecorder = new MediaRecorder(combinedStream);
        }

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            recordedChunks.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          cleanup();
          const finalBlob = new Blob(recordedChunks, { type: mimeType });
          resolve({
            blob: finalBlob,
            mimeType,
            extension
          });
        };

        // Draw loop
        const drawFrame = () => {
          if (signal?.aborted) return;

          const currentSec = video.currentTime;
          const currentProgress = Math.min(100, Math.max(0, ((currentSec - startTime) / duration) * 100));
          if (onProgress) onProgress(currentProgress);

          if (currentSec >= targetEnd || video.ended) {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
              mediaRecorder.stop();
            }
            return;
          }

          // Clear Canvas
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Apply Rotation Matrix
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          if (edits.rotation !== 0) {
            ctx.rotate((edits.rotation * Math.PI) / 180);
          }

          // Draw cropped video frame
          const drawW = isRotated90 ? canvas.height : canvas.width;
          const drawH = isRotated90 ? canvas.width : canvas.height;
          try {
            ctx.drawImage(video, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
          } catch {
            // ignore frame rendering glitches
          }
          ctx.restore();

          // Apply Text Overlay if configured
          if (edits.textOverlay && edits.textOverlay.text.trim().length > 0) {
            const overlay = edits.textOverlay;
            const text = overlay.text.trim();
            const fontSize = Math.max(14, Math.round(canvas.height * (overlay.fontSize / 400)));
            ctx.font = `bold ${fontSize}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            let posX = canvas.width / 2;
            let posY = canvas.height / 2;
            if (overlay.position === 'top') {
              posY = Math.max(fontSize + 16, canvas.height * 0.12);
            } else if (overlay.position === 'bottom') {
              posY = Math.min(canvas.height - fontSize - 16, canvas.height * 0.88);
            }

            const metrics = ctx.measureText(text);
            const padX = fontSize * 0.8;
            const padY = fontSize * 0.4;
            const bgW = metrics.width + padX * 2;
            const bgH = fontSize * 1.4 + padY;

            if (overlay.showBg) {
              ctx.fillStyle = overlay.bgColor || 'rgba(0, 0, 0, 0.7)';
              // Rounded pill background
              const radius = 8;
              const rx = posX - bgW / 2;
              const ry = posY - bgH / 2;
              ctx.beginPath();
              ctx.roundRect ? ctx.roundRect(rx, ry, bgW, bgH, radius) : ctx.rect(rx, ry, bgW, bgH);
              ctx.fill();
            }

            ctx.fillStyle = overlay.color || '#FFFFFF';
            ctx.fillText(text, posX, posY);
          }

          // Apply Video Player Overlay (first 1-2 seconds) if enabled
          if (edits.playerOverlay && edits.playerOverlay.enabled) {
            const elapsed = Math.max(0, currentSec - startTime);
            drawPlayerOverlay(
              ctx,
              canvas.width,
              canvas.height,
              elapsed,
              duration,
              edits.playerOverlay,
              `PART ${clip.originalIndex + 1}`
            );
          }

          // Frame scheduling with background tab throttling protection:
          // When the browser tab is hidden/minimized, requestAnimationFrame drops to 1 FPS or freezes.
          // Using window.setTimeout fallback ensures the export runs at full 30 FPS in the background!
          if (document.hidden) {
            backupTimerId = window.setTimeout(drawFrame, 32);
          } else {
            animFrameId = requestAnimationFrame(drawFrame);
          }
        };

        // Seek to startTime, then start playback and recording
        video.currentTime = startTime;

        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
          }
          mediaRecorder?.start(500); // 500ms chunks
          video.play().then(() => {
            drawFrame();
          }).catch((playErr) => {
            cleanup();
            reject(new Error(`Playback permission error: ${playErr.message}`));
          });
        };

        video.addEventListener('seeked', onSeeked, { once: true });
      } catch (procErr: unknown) {
        cleanup();
        reject(procErr instanceof Error ? procErr : new Error('Video processing failure'));
      }
    };

    video.src = sourceUrl;
  });
}
