import type { PlayerOverlaySettings } from '../types/video';
import { formatTimestamp } from './time';

export const DEFAULT_PLAYER_OVERLAY: PlayerOverlaySettings = {
  enabled: true,
  durationSec: 1.5,
  style: 'modern',
  showPlayButton: true,
  showProgressBar: true,
  showTimestamp: true
};

/**
 * Draws a sleek, social-media video player HUD overlay onto the canvas
 * for the first 1-2 seconds of the clip, then smoothly fades out.
 * 
 * @param ctx 2D Canvas rendering context
 * @param width Canvas width in pixels
 * @param height Canvas height in pixels
 * @param clipTimeSec Current elapsed time in the clip (seconds from clip start)
 * @param totalClipDuration Total duration of the clip in seconds
 * @param settings Overlay settings
 * @param clipLabel Optional label like "Clip #1" or "Part 1"
 */
export function drawPlayerOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  clipTimeSec: number,
  totalClipDuration: number,
  settings?: PlayerOverlaySettings | null,
  clipLabel?: string
): void {
  if (!settings || !settings.enabled) return;

  const duration = Math.max(0.5, Math.min(5.0, settings.durationSec || 1.5));
  
  // If time has passed the overlay duration, don't draw anything
  if (clipTimeSec < 0 || clipTimeSec >= duration) return;

  // Calculate smooth fade-out opacity in the final 0.4 seconds of duration
  const fadeWindow = 0.4;
  let alpha = 1.0;
  if (clipTimeSec > duration - fadeWindow) {
    alpha = Math.max(0, (duration - clipTimeSec) / fadeWindow);
  }

  if (alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  const scale = Math.max(0.5, Math.min(2.5, height / 720));

  // 1. Top subtle gradient & Title HUD
  const topGradHeight = Math.round(90 * scale);
  const topGrad = ctx.createLinearGradient(0, 0, 0, topGradHeight);
  topGrad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  topGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.25)');
  topGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, width, topGradHeight);

  // Top header elements
  const topPaddingX = Math.round(20 * scale);
  const topPaddingY = Math.round(22 * scale);
  const fontSizeHeader = Math.max(11, Math.round(14 * scale));

  // Header pill badge: e.g. "▶ VIDEO PLAYER" or Clip label
  const pillText = clipLabel || '▶ VIDEO PLAYER';
  ctx.font = `600 ${fontSizeHeader}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  const textMetrics = ctx.measureText(pillText);
  const pillPadX = 10 * scale;
  const pillPadY = 5 * scale;
  const pillW = textMetrics.width + pillPadX * 2;
  const pillH = fontSizeHeader + pillPadY * 2;

  // Draw top-left glass pill
  ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  const pillX = topPaddingX;
  const pillY = topPaddingY;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(pillX, pillY, pillW, pillH, 6 * scale);
  } else {
    ctx.rect(pillX, pillY, pillW, pillH);
  }
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(pillText, pillX + pillPadX, pillY + pillH / 2);

  // Top-right Quality Badge: "1080p HD"
  const qualityText = '1080p HD';
  ctx.font = `700 ${Math.max(10, Math.round(12 * scale))}px -apple-system, BlinkMacSystemFont, sans-serif`;
  const qMetrics = ctx.measureText(qualityText);
  const qW = qMetrics.width + 12 * scale;
  const qH = 22 * scale;
  const qX = width - topPaddingX - qW;
  const qY = topPaddingY + (pillH - qH) / 2;

  ctx.fillStyle = 'rgba(239, 68, 68, 0.85)'; // vibrant red badge like YouTube / Netflix
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(qX, qY, qW, qH, 4 * scale);
  } else {
    ctx.rect(qX, qY, qW, qH);
  }
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(qualityText, qX + qW / 2, qY + qH / 2);

  // 2. Center Animated Play Icon / Circle HUD
  if (settings.showPlayButton !== false) {
    const centerX = width / 2;
    const centerY = height / 2;
    const circleRadius = Math.round(36 * scale);

    // Subtle pulsating glow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 16 * scale;

    // Outer circle
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Reset shadow
    ctx.shadowBlur = 0;

    // Draw Play Triangle
    const iconSize = Math.round(18 * scale);
    const triX = centerX + iconSize * 0.18; // visually center triangle
    const triY = centerY;

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(triX + iconSize * 0.7, triY);
    ctx.lineTo(triX - iconSize * 0.5, triY - iconSize * 0.65);
    ctx.lineTo(triX - iconSize * 0.5, triY + iconSize * 0.65);
    ctx.closePath();
    ctx.fill();
  }

  // 3. Bottom Scrubber Bar & Controls HUD
  const bottomGradHeight = Math.round(110 * scale);
  const bottomGrad = ctx.createLinearGradient(0, height - bottomGradHeight, 0, height);
  bottomGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  bottomGrad.addColorStop(0.3, 'rgba(0, 0, 0, 0.35)');
  bottomGrad.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
  ctx.fillStyle = bottomGrad;
  ctx.fillRect(0, height - bottomGradHeight, width, bottomGradHeight);

  const bottomPadX = Math.round(20 * scale);
  const bottomPadY = Math.round(18 * scale);

  // Progress Track
  if (settings.showProgressBar !== false) {
    const barY = height - bottomPadY - Math.round(26 * scale);
    const barW = width - bottomPadX * 2;
    const barH = Math.max(3, Math.round(5 * scale));

    // Background track
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(bottomPadX, barY, barW, barH, barH / 2);
    } else {
      ctx.rect(bottomPadX, barY, barW, barH);
    }
    ctx.fill();

    // Filled progress portion (simulating playback progress or time into clip)
    const progressRatio = Math.max(0.02, Math.min(1.0, clipTimeSec / Math.max(1, totalClipDuration)));
    const filledW = barW * progressRatio;

    // Neon red/crimson gradient progress
    const progGrad = ctx.createLinearGradient(bottomPadX, 0, bottomPadX + filledW, 0);
    progGrad.addColorStop(0, '#f43f5e');
    progGrad.addColorStop(1, '#ef4444');

    ctx.fillStyle = progGrad;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(bottomPadX, barY, filledW, barH, barH / 2);
    } else {
      ctx.rect(bottomPadX, barY, filledW, barH);
    }
    ctx.fill();

    // Glowing scrubber thumb
    const thumbX = bottomPadX + filledW;
    const thumbY = barY + barH / 2;
    const thumbR = Math.max(4, Math.round(6 * scale));

    ctx.shadowColor = 'rgba(239, 68, 68, 0.8)';
    ctx.shadowBlur = 8 * scale;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(thumbX, thumbY, thumbR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // 4. Timecode and Mini Player Icons
  if (settings.showTimestamp !== false) {
    const controlsY = height - bottomPadY - Math.round(6 * scale);
    const fontSizeControls = Math.max(10, Math.round(13 * scale));

    // Timecode: e.g. "0:01 / 0:30"
    const currentFormatted = formatTimestamp(clipTimeSec, false).replace(/^00:/, '');
    const totalFormatted = formatTimestamp(totalClipDuration, false).replace(/^00:/, '');
    const timecodeStr = `${currentFormatted} / ${totalFormatted}`;

    ctx.font = `500 ${fontSizeControls}px "SF Mono", Monaco, Consolas, monospace`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(timecodeStr, bottomPadX, controlsY);

    // Right side player icons: Volume icon + Fullscreen frame
    const iconY = controlsY - fontSizeControls / 2;
    const iconRightX = width - bottomPadX;

    // Fullscreen square icon on far right
    const fsSize = Math.round(12 * scale);
    const fsX = iconRightX - fsSize;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    // 4 corners of fullscreen icon
    const cLen = fsSize * 0.35;
    // Top-left
    ctx.moveTo(fsX, fsY(iconY, fsSize) + cLen);
    ctx.lineTo(fsX, fsY(iconY, fsSize));
    ctx.lineTo(fsX + cLen, fsY(iconY, fsSize));
    // Top-right
    ctx.moveTo(fsX + fsSize - cLen, fsY(iconY, fsSize));
    ctx.lineTo(fsX + fsSize, fsY(iconY, fsSize));
    ctx.lineTo(fsX + fsSize, fsY(iconY, fsSize) + cLen);
    // Bottom-left
    ctx.moveTo(fsX, fsY(iconY, fsSize) + fsSize - cLen);
    ctx.lineTo(fsX, fsY(iconY, fsSize) + fsSize);
    ctx.lineTo(fsX + cLen, fsY(iconY, fsSize) + fsSize);
    // Bottom-right
    ctx.moveTo(fsX + fsSize - cLen, fsY(iconY, fsSize) + fsSize);
    ctx.lineTo(fsX + fsSize, fsY(iconY, fsSize) + fsSize);
    ctx.lineTo(fsX + fsSize, fsY(iconY, fsSize) + fsSize - cLen);
    ctx.stroke();

    // Volume speaker icon next to fullscreen icon
    const volX = fsX - Math.round(24 * scale);
    drawMiniVolumeIcon(ctx, volX, iconY, scale);
  }

  ctx.restore();
}

function fsY(centerY: number, size: number): number {
  return centerY - size / 2;
}

function drawMiniVolumeIcon(ctx: CanvasRenderingContext2D, x: number, centerY: number, scale: number): void {
  const w = 7 * scale;
  const h = 8 * scale;
  const top = centerY - h / 2;

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  // Speaker body
  ctx.rect(x, top + h * 0.25, w * 0.35, h * 0.5);
  // Cone
  ctx.moveTo(x + w * 0.35, top + h * 0.25);
  ctx.lineTo(x + w * 0.8, top);
  ctx.lineTo(x + w * 0.8, top + h);
  ctx.lineTo(x + w * 0.35, top + h * 0.75);
  ctx.closePath();
  ctx.fill();

  // Sound wave arc
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1.2 * scale;
  ctx.beginPath();
  ctx.arc(x + w * 0.7, centerY, h * 0.45, -Math.PI * 0.3, Math.PI * 0.3);
  ctx.stroke();
}
