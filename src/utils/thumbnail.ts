/**
 * Fast client-side thumbnail generator using an offscreen video element and canvas.
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
      resolve(createFallbackThumbnail(targetWidth, 180));
    }, 4000);

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
        const ctx = canvas.getContext('2d');

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
      resolve(createFallbackThumbnail(targetWidth, 180));
    };

    video.onerror = () => {
      clearTimeout(timeoutId);
      cleanUp();
      resolve(createFallbackThumbnail(targetWidth, 180));
    };

    video.src = videoUrl;
  });
}

function createFallbackThumbnail(width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Gradient dark background
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#1E1B4B');
    grad.addColorStop(1, '#0F172A');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#6366F1';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎬 Clip Preview', width / 2, height / 2);
    return canvas.toDataURL('image/jpeg', 0.8);
  }
  return '';
}
