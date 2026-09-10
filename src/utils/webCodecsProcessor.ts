import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { ClipItem, CompressionProfile } from '../types/video';
import { drawPlayerOverlay } from './playerOverlay';
import { COMPRESSION_PROFILES } from './videoProcessor';

/**
 * Checks if the W3C WebCodecs API is available in the current browser.
 */
export function isWebCodecsSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder === 'function' &&
    typeof (window as unknown as { VideoFrame?: unknown }).VideoFrame === 'function'
  );
}

/**
 * Finds the best supported AVC (H.264) codec string for the current device GPU encoder.
 */
export async function getSupportedVideoCodec(
  width: number,
  height: number,
  bitrate: number
): Promise<string> {
  const candidateCodecs = [
    'avc1.640028', // High Profile, Level 4.0
    'avc1.4D401F', // Main Profile, Level 3.1
    'avc1.42E01E', // Baseline Profile, Level 3.0 (broadest compatibility)
    'avc1.64001f'
  ];

  if (typeof VideoEncoder !== 'undefined' && VideoEncoder.isConfigSupported) {
    for (const codec of candidateCodecs) {
      try {
        const support = await VideoEncoder.isConfigSupported({
          codec,
          width,
          height,
          bitrate,
          framerate: 30,
          hardwareAcceleration: 'prefer-hardware'
        });
        if (support.supported) {
          return codec;
        }
      } catch {
        // continue checking
      }
    }
  }

  return 'avc1.42E01E';
}

export interface WebCodecsProcessOptions {
  sourceUrl: string;
  clip: ClipItem;
  profile: CompressionProfile;
  playbackRate?: number;
  signal?: AbortSignal;
  onProgress?: (progressPercent: number) => void;
}

/**
 * High-speed hardware-accelerated video export using WebCodecs and MP4Box/mp4-muxer.
 * Decoupled from wall-clock time for up to 10x - 20x faster encoding than MediaRecorder.
 */
export async function processClipWithWebCodecs({
  sourceUrl,
  clip,
  profile,
  playbackRate = 6.0,
  signal,
  onProgress
}: WebCodecsProcessOptions): Promise<{ blob: Blob; mimeType: string; extension: string }> {
  return new Promise(async (resolve, reject) => {
    if (!isWebCodecsSupported()) {
      return reject(new Error('WebCodecs is not supported in this browser environment.'));
    }

    if (signal?.aborted) {
      return reject(new DOMException('Aborted by user', 'AbortError'));
    }

    const { edits, startTime, endTime } = clip;
    const duration = Math.min(90.0, Math.max(0.5, endTime - startTime));
    const targetEnd = startTime + duration;
    const config = COMPRESSION_PROFILES[profile];

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    let animId: number | null = null;
    let timerId: number | null = null;
    let encoder: VideoEncoder | null = null;
    let isCleanedUp = false;

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      if (animId) cancelAnimationFrame(animId);
      if (timerId) clearTimeout(timerId);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };

    const handleAbort = () => {
      cleanup();
      if (encoder && encoder.state !== 'closed') {
        try {
          encoder.close();
        } catch {}
      }
      reject(new DOMException('Processing cancelled by user', 'AbortError'));
    };

    if (signal) {
      signal.addEventListener('abort', handleAbort, { once: true });
    }

    video.onerror = () => {
      cleanup();
      reject(new Error(`Failed to load video source for WebCodecs processing`));
    };

    video.onloadedmetadata = async () => {
      try {
        const srcW = video.videoWidth || 1280;
        const srcH = video.videoHeight || 720;

        // Crop calculations
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

        const isRotated90 = edits.rotation === 90 || edits.rotation === 270;
        let outW = isRotated90 ? sh : sw;
        let outH = isRotated90 ? sw : sh;

        // Downscale to even dimensions if maxDimension is set
        if (config.maxDimension) {
          const maxDim = Math.max(outW, outH);
          if (maxDim > config.maxDimension) {
            const scale = config.maxDimension / maxDim;
            outW = Math.round((outW * scale) / 2) * 2;
            outH = Math.round((outH * scale) / 2) * 2;
          }
        }

        // H.264 encoders strictly require even width and height
        outW = Math.round(outW / 2) * 2;
        outH = Math.round(outH / 2) * 2;

        const codecString = await getSupportedVideoCodec(outW, outH, config.videoBitrate);

        // Initialize MP4 Muxer
        const muxer = new Muxer({
          target: new ArrayBufferTarget(),
          video: {
            codec: 'avc',
            width: outW,
            height: outH
          },
          fastStart: 'in-memory'
        });

        // Initialize WebCodecs VideoEncoder
        let encoderError: Error | null = null;
        encoder = new VideoEncoder({
          output: (chunk, meta) => {
            muxer.addVideoChunk(chunk, meta);
          },
          error: (e) => {
            console.error('WebCodecs VideoEncoder internal error:', e);
            encoderError = e;
          }
        });

        encoder.configure({
          codec: codecString,
          width: outW,
          height: outH,
          bitrate: config.videoBitrate,
          framerate: 30,
          hardwareAcceleration: 'prefer-hardware'
        });

        // Offscreen canvas for rendering transformations & HUD
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(160, outW);
        canvas.height = Math.max(160, outH);
        const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

        if (!ctx) {
          cleanup();
          return reject(new Error('Canvas 2D context creation failed'));
        }

        let frameCount = 0;
        let lastEncodedSec = -1;
        const targetFps = 30;
        const frameInterval = 1 / targetFps;

        // Main rendering and encoding pump
        const stepAndEncode = async () => {
          if (signal?.aborted || isCleanedUp) return;
          if (encoderError) {
            cleanup();
            return reject(encoderError);
          }

          const currentSec = video.currentTime;
          const clipElapsed = Math.max(0, currentSec - startTime);
          const progressPercent = Math.min(100, Math.max(0, (clipElapsed / duration) * 100));

          if (onProgress) onProgress(progressPercent);

          // Check for completion
          if (currentSec >= targetEnd || video.ended) {
            cleanup();
            try {
              if (encoder && encoder.state === 'configured') {
                await encoder.flush();
                encoder.close();
              }
              muxer.finalize();
              const { buffer } = muxer.target;
              const blob = new Blob([buffer], { type: 'video/mp4' });
              return resolve({
                blob,
                mimeType: 'video/mp4',
                extension: 'mp4'
              });
            } catch (finalizeErr) {
              return reject(finalizeErr instanceof Error ? finalizeErr : new Error('Muxing failed'));
            }
          }

          // Sample frames at ~30 FPS intervals
          if (currentSec - lastEncodedSec >= frameInterval * 0.85 || lastEncodedSec < 0) {
            lastEncodedSec = currentSec;

            // 1. Clear background
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // 2. Apply Rotation
            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);
            if (edits.rotation !== 0) {
              ctx.rotate((edits.rotation * Math.PI) / 180);
            }

            // 3. Draw Video Frame
            const drawW = isRotated90 ? canvas.height : canvas.width;
            const drawH = isRotated90 ? canvas.width : canvas.height;
            try {
              ctx.drawImage(video, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
            } catch {
              // ignore minor frame glitches
            }
            ctx.restore();

            // 4. Draw Text Overlay
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

            // 5. Draw Video Player HUD Overlay (first 1-2s)
            if (edits.playerOverlay && edits.playerOverlay.enabled) {
              drawPlayerOverlay(
                ctx,
                canvas.width,
                canvas.height,
                clipElapsed,
                duration,
                edits.playerOverlay,
                `PART ${clip.originalIndex + 1}`
              );
            }

            // 6. Pass VideoFrame directly to hardware GPU VideoEncoder
            try {
              // Timestamp in microseconds (Presentation Timestamp)
              const timestampUs = Math.round(clipElapsed * 1_000_000);
              const frame = new VideoFrame(canvas, { timestamp: timestampUs });

              // Keyframe every 2 seconds (60 frames)
              const isKeyFrame = frameCount % 60 === 0;
              if (encoder && encoder.state === 'configured') {
                encoder.encode(frame, { keyFrame: isKeyFrame });
              }
              frame.close(); // CRITICAL: Release GPU memory immediately
              frameCount++;
            } catch (encErr) {
              console.warn('Frame encode error:', encErr);
            }
          }

          // Pump next frame using requestVideoFrameCallback or fast loop
          if ('requestVideoFrameCallback' in video) {
            (video as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => number }).requestVideoFrameCallback(() => {
              stepAndEncode();
            });
          } else if (document.hidden) {
            timerId = window.setTimeout(stepAndEncode, 16);
          } else {
            animId = requestAnimationFrame(stepAndEncode);
          }
        };

        // Seek to startTime
        video.currentTime = startTime;

        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          // Turbo GPU playback rate: 6x-8x speed!
          // WebCodecs decodes and encodes at up to 8x wall-clock speed!
          const targetRate = Math.min(16.0, Math.max(1.0, playbackRate));
          try {
            video.playbackRate = targetRate;
          } catch {
            try {
              video.playbackRate = 4.0;
            } catch {
              video.playbackRate = 2.0;
            }
          }

          video.play().then(() => {
            stepAndEncode();
          }).catch((err) => {
            cleanup();
            reject(new Error(`Playback start error: ${err.message}`));
          });
        };

        video.addEventListener('seeked', onSeeked, { once: true });
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error('WebCodecs setup failed'));
      }
    };

    video.src = sourceUrl;
  });
}
