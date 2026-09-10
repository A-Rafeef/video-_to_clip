import React, { useRef, useEffect } from 'react';
import { X, Play, Pause, Film } from 'lucide-react';
import type { ClipItem, VideoMetadata } from '../types/video';
import { formatTimestamp, formatDurationHuman } from '../utils/time';

interface QuickPreviewModalProps {
  clip: ClipItem | null;
  sourceMetadata: VideoMetadata | null;
  isOpen: boolean;
  onClose: () => void;
}

export const QuickPreviewModal: React.FC<QuickPreviewModalProps> = ({
  clip,
  sourceMetadata,
  isOpen,
  onClose
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isOpen || !clip || !sourceMetadata) return;

    const video = videoRef.current;
    if (!video) return;

    video.currentTime = clip.startTime;
    video.muted = clip.edits.mute;

    const onTimeUpdate = () => {
      if (video.currentTime >= clip.endTime) {
        video.currentTime = clip.startTime;
      }
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.play().catch(() => {});

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.pause();
    };
  }, [isOpen, clip, sourceMetadata]);

  // Live Canvas with applied edits
  useEffect(() => {
    if (!isOpen || !clip) return;
    let animId: number;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      if (video.readyState >= 2) {
        const srcW = video.videoWidth || 1280;
        const srcH = video.videoHeight || 720;

        let sx = 0;
        let sy = 0;
        let sw = srcW;
        let sh = srcH;

        if (clip.edits.crop) {
          sx = clip.edits.crop.x;
          sy = clip.edits.crop.y;
          sw = clip.edits.crop.width;
          sh = clip.edits.crop.height;
        }

        const isRotated90 = clip.edits.rotation === 90 || clip.edits.rotation === 270;
        const targetW = isRotated90 ? 720 : 1280;
        const targetH = isRotated90 ? 1280 : 720;

        canvas.width = targetW;
        canvas.height = targetH;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, targetW, targetH);

        ctx.save();
        ctx.translate(targetW / 2, targetH / 2);
        if (clip.edits.rotation !== 0) {
          ctx.rotate((clip.edits.rotation * Math.PI) / 180);
        }

        const drawW = isRotated90 ? targetH : targetW;
        const drawH = isRotated90 ? targetW : targetH;
        try {
          ctx.drawImage(video, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
        } catch {
          // ignore
        }
        ctx.restore();

        // Text overlay
        if (clip.edits.textOverlay && clip.edits.textOverlay.text.trim()) {
          const t = clip.edits.textOverlay;
          const fontSize = Math.max(16, Math.round(targetH * (t.fontSize / 400)));
          ctx.font = `bold ${fontSize}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          let posY = targetH / 2;
          if (t.position === 'top') posY = targetH * 0.15;
          if (t.position === 'bottom') posY = targetH * 0.85;

          const text = t.text.trim();
          const metrics = ctx.measureText(text);

          if (t.showBg) {
            ctx.fillStyle = t.bgColor || 'rgba(0,0,0,0.7)';
            const padX = fontSize * 0.7;
            const padY = fontSize * 0.35;
            const rx = targetW / 2 - metrics.width / 2 - padX;
            const ry = posY - fontSize / 2 - padY;
            ctx.beginPath();
            ctx.roundRect
              ? ctx.roundRect(rx, ry, metrics.width + padX * 2, fontSize + padY * 2, 8)
              : ctx.rect(rx, ry, metrics.width + padX * 2, fontSize + padY * 2);
            ctx.fill();
          }

          ctx.fillStyle = t.color || '#FFFFFF';
          ctx.fillText(text, targetW / 2, posY);
        }
      }
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [isOpen, clip]);

  if (!isOpen || !clip || !sourceMetadata) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" style={{ maxWidth: '800px' }} onClick={(e) => e.stopPropagation()}>
        <video
          ref={videoRef}
          src={sourceMetadata.url}
          style={{ display: 'none' }}
          playsInline
        />

        <div className="modal-header">
          <div className="modal-title">
            <Film size={18} color="var(--primary)" />
            <span>Clip Preview: #{clip.originalIndex + 1}</span>
            <span className="brand-badge" style={{ textTransform: 'none' }}>
              {formatDurationHuman(clip.duration)}
            </span>
          </div>
          <button className="toolbar-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ alignItems: 'center' }}>
          <div className="editor-canvas-stage" style={{ width: '100%', maxHeight: '60vh' }}>
            <canvas ref={canvasRef} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span>Time: {formatTimestamp(clip.startTime)} → {formatTimestamp(clip.endTime)}</span>
            <span>Duration: {formatDurationHuman(clip.duration)}</span>
            <span>Status: {clip.status}</span>
          </div>
        </div>

        <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
          <button className="toolbar-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
