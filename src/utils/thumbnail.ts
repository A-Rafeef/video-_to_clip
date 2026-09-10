/**
 * High-performance client-side thumbnail generator.
 * Uses a persistent offscreen video pool to extract frame thumbnails rapidly in the background.
 */

/**
 * Creates an instantaneous stylized placeholder thumbnail with 0ms delay.
 * Allows clips to appear in the UI immediately without waiting for video seeks.
 */
export function createInstantThumbnail(
  index: number,
  durationSec: number,
  width: number = 320,
  height: number = 180
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (ctx) {
    // Rich gradient background
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.5, '#1e1b4b');
    grad.addColorStop(1, '#312e81');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Subtle grid/film pattern
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    for (let x = 0; x < width; x += 24) {
      ctx.fillRect(x, 0, 1, height);
    }

    // Title
    ctx.fillStyle = '#818cf8';
    ctx.font = 'bold 16px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`🎬 Clip #${index + 1}`, width / 2, height / 2 - 8);

    // Duration tag
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 12px Inter, system-ui, sans-serif';
    ctx.fillText(`${durationSec.toFixed(1)}s`, width / 2, height / 2 + 16);

    return canvas.toDataURL('image/jpeg', 0.7);
  }
  return '';
}

/**
 * Rapidly extracts thumbnails for a list of clips using a single reused video element.
 * Up to 10x faster than creating individual video elements.
 */
export async function generateThumbnailsInPool(
  videoUrl: string,
  clips: Array<{ id: string; timeSec: number }>,
  onThumbnailReady: (clipId: string, dataUrl: string) => void,
  targetWidth: number = 320
): Promise<void> {
  if (clips.length === 0) return;

  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    let currentIndex = 0;
    let seekTimeoutId: number | null = null;
    let isCleanedUp = false;

    const canvas = document.createElement('canvas');
    let ctx: CanvasRenderingContext2D | null = null;

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      if (seekTimeoutId) clearTimeout(seekTimeoutId);
      video.pause();
      video.removeAttribute('src');
      video.load();
      resolve();
    };

    const processNext = () => {
      if (currentIndex >= clips.length || isCleanedUp) {
        cleanup();
        return;
      }

      const item = clips[currentIndex];
      const maxTime = Math.max(0.1, (video.duration || 1000) - 0.2);
      const targetTime = Math.min(maxTime, Math.max(0.1, item.timeSec));

      // 1.5s timeout per frame so one slow seek doesn't hang the pipeline
      if (seekTimeoutId) clearTimeout(seekTimeoutId);
      seekTimeoutId = window.setTimeout(() => {
        currentIndex++;
        processNext();
      }, 1500);

      video.currentTime = targetTime;
    };

    video.onloadedmetadata = () => {
      const aspect = (video.videoHeight || 9) / (video.videoWidth || 16);
      const targetHeight = Math.round(targetWidth * aspect);
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      ctx = canvas.getContext('2d', { alpha: false });

      processNext();
    };

    video.onseeked = () => {
      if (seekTimeoutId) clearTimeout(seekTimeoutId);

      if (ctx && currentIndex < clips.length) {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
          onThumbnailReady(clips[currentIndex].id, dataUrl);
        } catch {
          // ignore extraction error
        }
      }

      currentIndex++;
      processNext();
    };

    video.onerror = () => {
      cleanup();
    };

    video.src = videoUrl;
  });
}

/**
 * Single frame fallback thumbnail generator.
 */
export async function generateThumbnail(
  videoUrl: string,
  timeSec: number,
  targetWidth: number = 320
): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    const cleanUp = () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };

    const timeoutId = setTimeout(() => {
      cleanUp();
      resolve(createInstantThumbnail(0, 0, targetWidth, 180));
    }, 2500);

    video.onloadedmetadata = () => {
      const seekTime = Math.min(Math.max(0.1, timeSec), Math.max(0, video.duration - 0.1));
      video.currentTime = seekTime;
    };

    video.onseeked = () => {
      clearTimeout(timeoutId);
      try {
        const aspect = (video.videoHeight || 9) / (video.videoWidth || 16);
        const targetHeight = Math.round(targetWidth * aspect);

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d', { alpha: false });

        if (ctx) {
          ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          cleanUp();
          resolve(dataUrl);
          return;
        }
      } catch (err) {
        console.warn('Error generating frame thumbnail:', err);
      }
      cleanUp();
      resolve(createInstantThumbnail(0, 0, targetWidth, 180));
    };

    video.onerror = () => {
      clearTimeout(timeoutId);
      cleanUp();
      resolve(createInstantThumbnail(0, 0, targetWidth, 180));
    };

    video.src = videoUrl;
  });
}
