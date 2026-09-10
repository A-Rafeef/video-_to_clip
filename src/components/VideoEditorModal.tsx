import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCw,
  Volume2,
  VolumeX,
  Crop,
  Type,
  Scissors,
  Undo2,
  Redo2,
  Save,
  Check,
  Clock,
  Sparkles,
  Layers,
  MonitorPlay
} from 'lucide-react';
import type { ClipItem, ClipEditState, VideoMetadata, PlayerOverlaySettings } from '../types/video';
import { formatTimestamp, formatDurationHuman, MAX_CLIP_DURATION_SECONDS } from '../utils/time';
import { drawPlayerOverlay, DEFAULT_PLAYER_OVERLAY } from '../utils/playerOverlay';

interface VideoEditorModalProps {
  clip: ClipItem;
  sourceMetadata: VideoMetadata;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedClip: ClipItem) => void;
  onSplitClip: (clipId: string, splitAtSec: number) => void;
}

export const VideoEditorModal: React.FC<VideoEditorModalProps> = ({
  clip,
  sourceMetadata,
  isOpen,
  onClose,
  onSave,
  onSplitClip
}) => {
  const [edits, setEdits] = useState<ClipEditState>(clip.edits);
  const [history, setHistory] = useState<ClipEditState[]>(clip.history.length > 0 ? clip.history : [clip.edits]);
  const [historyIndex, setHistoryIndex] = useState<number>(clip.historyIndex >= 0 ? clip.historyIndex : 0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(clip.edits.startTime);
  const [activeTab, setActiveTab] = useState<'trim' | 'crop' | 'rotate' | 'text' | 'player'>('trim');

  // Push new state to undo/redo history
  const recordEdit = useCallback((newEdits: ClipEditState) => {
    // Ensure duration <= 90s
    let { startTime, endTime } = newEdits;
    if (endTime - startTime > MAX_CLIP_DURATION_SECONDS) {
      endTime = startTime + MAX_CLIP_DURATION_SECONDS;
    }
    const validated = { ...newEdits, startTime, endTime };

    setEdits(validated);
    setHistory((prev) => {
      const nextHist = prev.slice(0, historyIndex + 1);
      nextHist.push(validated);
      return nextHist;
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIdx = historyIndex - 1;
      setHistoryIndex(newIdx);
      setEdits(history[newIdx]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIdx = historyIndex + 1;
      setHistoryIndex(newIdx);
      setEdits(history[newIdx]);
    }
  };

  // Sync video time & loop within [startTime, endTime]
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.currentTime >= edits.endTime) {
        video.currentTime = edits.startTime;
        if (!isPlaying) video.pause();
      }
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    return () => video.removeEventListener('timeupdate', onTimeUpdate);
  }, [edits.startTime, edits.endTime, isPlaying]);

  // Live Canvas Rendering
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

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

        if (edits.crop) {
          sx = edits.crop.x;
          sy = edits.crop.y;
          sw = edits.crop.width;
          sh = edits.crop.height;
        }

        const isRotated90 = edits.rotation === 90 || edits.rotation === 270;
        const targetW = isRotated90 ? 720 : 1280;
        const targetH = isRotated90 ? 1280 : 720;

        canvas.width = targetW;
        canvas.height = targetH;

        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, targetW, targetH);

        ctx.save();
        ctx.translate(targetW / 2, targetH / 2);
        if (edits.rotation !== 0) {
          ctx.rotate((edits.rotation * Math.PI) / 180);
        }

        const drawW = isRotated90 ? targetH : targetW;
        const drawH = isRotated90 ? targetW : targetH;
        try {
          ctx.drawImage(video, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
        } catch {
          // ignore
        }
        ctx.restore();

        // Overlay text
        if (edits.textOverlay && edits.textOverlay.text.trim()) {
          const t = edits.textOverlay;
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

        // Video Player HUD Overlay (first 1-2s)
        if (edits.playerOverlay && edits.playerOverlay.enabled) {
          const clipElapsed = Math.max(0, video.currentTime - edits.startTime);
          const currentDur = edits.endTime - edits.startTime;
          drawPlayerOverlay(
            ctx,
            targetW,
            targetH,
            clipElapsed,
            currentDur,
            edits.playerOverlay,
            `PART ${clip.originalIndex + 1}`
          );
        }
      }
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [edits]);

  // Video Play / Pause toggle
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (video.currentTime >= edits.endTime || video.currentTime < edits.startTime) {
        video.currentTime = edits.startTime;
      }
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  // Step frames (frame-accurate adjustment)
  const stepFrame = (forward: boolean) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setIsPlaying(false);
    const step = 1 / (sourceMetadata.fps || 30);
    const newTime = Math.max(
      edits.startTime,
      Math.min(edits.endTime, video.currentTime + (forward ? step : -step))
    );
    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Trimming In / Out points
  const setInPoint = (time: number) => {
    const clampedIn = Math.max(0, Math.min(time, edits.endTime - 0.5));
    // Check <= 90s
    let newEnd = edits.endTime;
    if (newEnd - clampedIn > MAX_CLIP_DURATION_SECONDS) {
      newEnd = clampedIn + MAX_CLIP_DURATION_SECONDS;
    }
    recordEdit({
      ...edits,
      startTime: clampedIn,
      endTime: newEnd
    });
  };

  const setOutPoint = (time: number) => {
    const maxAllowed = edits.startTime + MAX_CLIP_DURATION_SECONDS;
    const clampedOut = Math.min(sourceMetadata.duration, Math.min(maxAllowed, Math.max(edits.startTime + 0.5, time)));
    recordEdit({
      ...edits,
      endTime: clampedOut
    });
  };

  // Split / Cut clip
  const handleSplitHere = () => {
    const splitPoint = currentTime;
    if (splitPoint - edits.startTime < 0.5 || edits.endTime - splitPoint < 0.5) {
      alert('Split point must be at least 0.5 seconds away from clip boundaries.');
      return;
    }
    onSplitClip(clip.id, splitPoint);
    onClose();
  };

  // Rotate toggle
  const handleRotate = () => {
    const nextRot = ((edits.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    recordEdit({ ...edits, rotation: nextRot });
  };

  // Crop presets
  const handleCropPreset = (preset: 'free' | '16:9' | '9:16' | '1:1' | '4:5') => {
    if (preset === 'free') {
      recordEdit({ ...edits, crop: null });
      return;
    }

    const srcW = sourceMetadata.width || 1280;
    const srcH = sourceMetadata.height || 720;
    let targetRatio = 16 / 9;
    if (preset === '9:16') targetRatio = 9 / 16;
    if (preset === '1:1') targetRatio = 1;
    if (preset === '4:5') targetRatio = 4 / 5;

    let cropW = srcW;
    let cropH = srcW / targetRatio;

    if (cropH > srcH) {
      cropH = srcH;
      cropW = srcH * targetRatio;
    }

    const x = Math.round((srcW - cropW) / 2);
    const y = Math.round((srcH - cropH) / 2);

    recordEdit({
      ...edits,
      crop: {
        x,
        y,
        width: Math.round(cropW),
        height: Math.round(cropH),
        aspectRatio: preset
      }
    });
  };

  // Save changes
  const handleSave = () => {
    const duration = edits.endTime - edits.startTime;
    const updated: ClipItem = {
      ...clip,
      startTime: edits.startTime,
      endTime: edits.endTime,
      duration: Math.min(MAX_CLIP_DURATION_SECONDS, duration),
      edits,
      history,
      historyIndex,
      // invalidate cached blob since edits changed
      status: 'waiting',
      processedBlob: undefined,
      processedUrl: undefined
    };
    onSave(updated);
    onClose();
  };

  // Keyboard shortcuts listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['input', 'textarea'].includes((e.target as HTMLElement).tagName.toLowerCase())) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        stepFrame(false);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        stepFrame(true);
      } else if (e.key === 'i' || e.key === 'I') {
        setInPoint(currentTime);
      } else if (e.key === 'o' || e.key === 'O') {
        setOutPoint(currentTime);
      } else if (e.key === 'm' || e.key === 'M') {
        recordEdit({ ...edits, mute: !edits.mute });
      } else if (e.key === 'c' || e.key === 'C') {
        handleSplitHere();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentTime, edits, recordEdit, onClose]);

  if (!isOpen) return null;

  const currentDuration = edits.endTime - edits.startTime;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Hidden video element supplying decoded frames */}
        <video
          ref={videoRef}
          src={sourceMetadata.url}
          style={{ display: 'none' }}
          muted={edits.mute}
          playsInline
        />

        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title">
            <Sparkles size={18} color="var(--primary)" />
            <span>Edit Clip #{clip.originalIndex + 1}</span>
            <span className="brand-badge" style={{ textTransform: 'none' }}>
              Duration: {formatDurationHuman(currentDuration)} (Max 90s)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="toolbar-btn"
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              title="Undo edit (Ctrl+Z)"
            >
              <Undo2 size={14} />
            </button>
            <button
              className="toolbar-btn"
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              title="Redo edit (Ctrl+Y)"
            >
              <Redo2 size={14} />
            </button>
            <button className="toolbar-btn" onClick={onClose} title="Close Editor">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          <div className="editor-main-grid">
            {/* Left: Canvas Video Player Preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="editor-canvas-stage">
                <canvas ref={canvasRef} />
              </div>

              {/* Player Controls Bar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(15, 23, 42, 0.6)', padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button className="toolbar-btn" onClick={togglePlay} title="Play/Pause (Space)">
                    {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button className="toolbar-btn" onClick={() => stepFrame(false)} title="Step 1 frame back (Left Arrow)">
                    <SkipBack size={14} />
                  </button>
                  <button className="toolbar-btn" onClick={() => stepFrame(true)} title="Step 1 frame forward (Right Arrow)">
                    <SkipForward size={14} />
                  </button>
                  <button
                    className="toolbar-btn"
                    onClick={() => recordEdit({ ...edits, mute: !edits.mute })}
                    title="Toggle Mute (M)"
                  >
                    {edits.mute ? <VolumeX size={14} color="var(--accent-rose)" /> : <Volume2 size={14} />}
                  </button>
                </div>

                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#cbd5e1' }}>
                  <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{formatTimestamp(currentTime)}</span>
                  <span style={{ color: 'var(--text-muted)' }}> / {formatTimestamp(edits.endTime)}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    className="toolbar-btn"
                    onClick={() => setInPoint(currentTime)}
                    title="Mark Start Point (I)"
                  >
                    Set [In]
                  </button>
                  <button
                    className="toolbar-btn"
                    onClick={() => setOutPoint(currentTime)}
                    title="Mark End Point (O)"
                  >
                    Set [Out]
                  </button>
                  <button
                    className="toolbar-btn"
                    onClick={handleSplitHere}
                    title="Split/Cut clip here into 2 parts (C)"
                    style={{ color: 'var(--accent-cyan)' }}
                  >
                    <Scissors size={14} />
                    <span>Cut Here</span>
                  </button>
                </div>
              </div>

              {/* Timeline Draggable Scrubber */}
              <div className="timeline-track-wrapper">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span>Start: {formatTimestamp(edits.startTime)}</span>
                  <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>
                    Duration: {formatDurationHuman(currentDuration)}
                  </span>
                  <span>End: {formatTimestamp(edits.endTime)}</span>
                </div>

                {/* Scrubber Bar */}
                <div
                  className="timeline-scrubber-bar"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = (e.clientX - rect.left) / rect.width;
                    const video = videoRef.current;
                    if (video) {
                      const seekTime = sourceMetadata.duration * ratio;
                      video.currentTime = seekTime;
                      setCurrentTime(seekTime);
                    }
                  }}
                >
                  {/* Trim Region highlight */}
                  <div
                    className="timeline-trim-region"
                    style={{
                      left: `${(edits.startTime / sourceMetadata.duration) * 100}%`,
                      width: `${((edits.endTime - edits.startTime) / sourceMetadata.duration) * 100}%`
                    }}
                  />

                  {/* Playhead */}
                  <div
                    className="timeline-playhead"
                    style={{
                      left: `${(currentTime / sourceMetadata.duration) * 100}%`
                    }}
                  />
                </div>

                {/* Range Sliders for Trimming Start/End */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Trim Start:</span>
                    <input
                      type="range"
                      min="0"
                      max={edits.endTime - 0.5}
                      step="0.1"
                      value={edits.startTime}
                      onChange={(e) => setInPoint(parseFloat(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--primary)' }}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Trim End (Max 90s from Start):</span>
                    <input
                      type="range"
                      min={edits.startTime + 0.5}
                      max={Math.min(sourceMetadata.duration, edits.startTime + MAX_CLIP_DURATION_SECONDS)}
                      step="0.1"
                      value={edits.endTime}
                      onChange={(e) => setOutPoint(parseFloat(e.target.value))}
                      style={{ width: '100%', accentColor: 'var(--primary)' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Sidebar: Tools & Tabs */}
            <div className="editor-sidebar-tabs">
              {/* Tab Navigation */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: 'var(--radius-sm)' }}>
                {(['trim', 'crop', 'rotate', 'text', 'player'] as const).map((tab) => (
                  <button
                    key={tab}
                    className={`toolbar-btn ${activeTab === tab ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      justifyContent: 'center',
                      background: activeTab === tab ? 'var(--primary)' : 'transparent',
                      color: activeTab === tab ? '#fff' : 'var(--text-secondary)',
                      textTransform: 'capitalize',
                      fontSize: '0.72rem',
                      padding: '8px 2px'
                    }}
                  >
                    {tab === 'player' ? 'Player HUD' : tab}
                  </button>
                ))}
              </div>

              {/* Tab: Crop */}
              {activeTab === 'crop' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    Aspect Ratio Crop Presets:
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                    <button
                      className={`toolbar-btn ${!edits.crop ? 'active' : ''}`}
                      onClick={() => handleCropPreset('free')}
                      style={{ padding: '10px' }}
                    >
                      Original / Free
                    </button>
                    <button
                      className={`toolbar-btn ${edits.crop?.aspectRatio === '16:9' ? 'active' : ''}`}
                      onClick={() => handleCropPreset('16:9')}
                      style={{ padding: '10px' }}
                    >
                      16:9 Landscape
                    </button>
                    <button
                      className={`toolbar-btn ${edits.crop?.aspectRatio === '9:16' ? 'active' : ''}`}
                      onClick={() => handleCropPreset('9:16')}
                      style={{ padding: '10px' }}
                    >
                      9:16 Reels / TikTok
                    </button>
                    <button
                      className={`toolbar-btn ${edits.crop?.aspectRatio === '1:1' ? 'active' : ''}`}
                      onClick={() => handleCropPreset('1:1')}
                      style={{ padding: '10px' }}
                    >
                      1:1 Square
                    </button>
                  </div>
                </div>
              )}

              {/* Tab: Rotate */}
              {activeTab === 'rotate' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    Rotate Video Orientation:
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="toolbar-btn" onClick={handleRotate} style={{ flex: 1, padding: '12px', justifyContent: 'center' }}>
                      <RotateCw size={16} />
                      <span>Rotate 90° Clockwise</span>
                    </button>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Current Rotation: <strong>{edits.rotation}°</strong>
                  </div>
                </div>
              )}

              {/* Tab: Text Overlay */}
              {activeTab === 'text' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    Watermark / Text Overlay:
                  </span>
                  <input
                    type="text"
                    placeholder="Enter overlay text..."
                    value={edits.textOverlay?.text || ''}
                    onChange={(e) => {
                      const text = e.target.value;
                      recordEdit({
                        ...edits,
                        textOverlay: {
                          text,
                          position: edits.textOverlay?.position || 'bottom',
                          fontSize: edits.textOverlay?.fontSize || 24,
                          color: edits.textOverlay?.color || '#FFFFFF',
                          bgColor: edits.textOverlay?.bgColor || 'rgba(0,0,0,0.7)',
                          showBg: edits.textOverlay?.showBg ?? true
                        }
                      });
                    }}
                    style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: '0.85rem' }}
                  />

                  {edits.textOverlay && (
                    <>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {(['top', 'center', 'bottom'] as const).map((pos) => (
                          <button
                            key={pos}
                            className={`toolbar-btn ${edits.textOverlay?.position === pos ? 'active' : ''}`}
                            onClick={() => recordEdit({ ...edits, textOverlay: { ...edits.textOverlay!, position: pos } })}
                            style={{ flex: 1, justifyContent: 'center', textTransform: 'capitalize' }}
                          >
                            {pos}
                          </button>
                        ))}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Background Pill:</span>
                        <input
                          type="checkbox"
                          checked={edits.textOverlay.showBg}
                          onChange={(e) => recordEdit({ ...edits, textOverlay: { ...edits.textOverlay!, showBg: e.target.checked } })}
                          style={{ accentColor: 'var(--primary)' }}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Tab: Player HUD Overlay */}
              {activeTab === 'player' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MonitorPlay size={16} color="var(--accent-cyan)" />
                    <span style={{ fontSize: '0.82rem', color: '#f8fafc', fontWeight: 600 }}>
                      Video Player HUD Overlay (1-2s)
                    </span>
                  </div>

                  <div style={{ padding: '8px 10px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: 'var(--radius-sm)', fontSize: '0.74rem', color: '#cbd5e1', lineHeight: 1.4 }}>
                    ✨ <strong>Anti-Copyright & Attention Hook:</strong> Simulates a modern video player overlay (play icon, progress scrubber, timecode) during the opening seconds of the clip.
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ fontSize: '0.8rem', color: '#fff', fontWeight: 500 }}>Enable Player Overlay:</span>
                    <input
                      type="checkbox"
                      checked={edits.playerOverlay?.enabled ?? true}
                      onChange={(e) => {
                        const current = edits.playerOverlay || DEFAULT_PLAYER_OVERLAY;
                        recordEdit({
                          ...edits,
                          playerOverlay: {
                            ...current,
                            enabled: e.target.checked
                          }
                        });
                      }}
                      style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }}
                    />
                  </div>

                  {(edits.playerOverlay?.enabled ?? true) && (
                    <>
                      {/* Duration Selector */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Overlay Duration:
                        </span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                          {([1.0, 1.5, 2.0] as const).map((dur) => {
                            const isCur = (edits.playerOverlay?.durationSec ?? 1.5) === dur;
                            return (
                              <button
                                key={dur}
                                className={`toolbar-btn ${isCur ? 'active' : ''}`}
                                onClick={() => {
                                  const current = edits.playerOverlay || DEFAULT_PLAYER_OVERLAY;
                                  recordEdit({
                                    ...edits,
                                    playerOverlay: { ...current, durationSec: dur }
                                  });
                                }}
                                style={{
                                  justifyContent: 'center',
                                  padding: '8px 4px',
                                  fontSize: '0.78rem',
                                  background: isCur ? 'var(--primary)' : 'rgba(0,0,0,0.3)'
                                }}
                              >
                                {dur.toFixed(1)}s
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Display Components Toggles */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '8px 10px', borderRadius: 'var(--radius-sm)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                          <span>Center Play Button:</span>
                          <input
                            type="checkbox"
                            checked={edits.playerOverlay?.showPlayButton ?? true}
                            onChange={(e) => {
                              const current = edits.playerOverlay || DEFAULT_PLAYER_OVERLAY;
                              recordEdit({
                                ...edits,
                                playerOverlay: { ...current, showPlayButton: e.target.checked }
                              });
                            }}
                            style={{ accentColor: 'var(--primary)' }}
                          />
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                          <span>Scrubber / Progress Bar:</span>
                          <input
                            type="checkbox"
                            checked={edits.playerOverlay?.showProgressBar ?? true}
                            onChange={(e) => {
                              const current = edits.playerOverlay || DEFAULT_PLAYER_OVERLAY;
                              recordEdit({
                                ...edits,
                                playerOverlay: { ...current, showProgressBar: e.target.checked }
                              });
                            }}
                            style={{ accentColor: 'var(--primary)' }}
                          />
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                          <span>Timecode & HD Badge:</span>
                          <input
                            type="checkbox"
                            checked={edits.playerOverlay?.showTimestamp ?? true}
                            onChange={(e) => {
                              const current = edits.playerOverlay || DEFAULT_PLAYER_OVERLAY;
                              recordEdit({
                                ...edits,
                                playerOverlay: { ...current, showTimestamp: e.target.checked }
                              });
                            }}
                            style={{ accentColor: 'var(--primary)' }}
                          />
                        </label>
                      </div>

                      {/* Quick Preview at 0.5s */}
                      <button
                        className="toolbar-btn"
                        onClick={() => {
                          const vid = videoRef.current;
                          if (vid) {
                            vid.pause();
                            setIsPlaying(false);
                            const seekTarget = edits.startTime + 0.5;
                            vid.currentTime = seekTarget;
                            setCurrentTime(seekTarget);
                          }
                        }}
                        style={{
                          justifyContent: 'center',
                          padding: '10px',
                          background: 'rgba(99, 102, 241, 0.15)',
                          borderColor: 'var(--primary)',
                          color: '#fff',
                          fontSize: '0.8rem'
                        }}
                      >
                        <Play size={14} color="var(--accent-cyan)" />
                        <span>Jump Playhead to 0.5s (Preview Overlay)</span>
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Tab: Trim Guide */}
              {activeTab === 'trim' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 600, color: '#f8fafc' }}>Trimming Controls:</span>
                  <p>• Use the sliders below the video to drag In and Out points.</p>
                  <p>• Hit <strong>[I]</strong> to set In-point at the current playhead.</p>
                  <p>• Hit <strong>[O]</strong> to set Out-point at the current playhead.</p>
                  <p>• Strict limit: duration cannot exceed <strong>90.0 seconds</strong>.</p>
                </div>
              )}

              {/* Keyboard Shortcuts Reference */}
              <div style={{ marginTop: 'auto', background: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                  Keyboard Shortcuts
                </span>
                <div className="keyboard-hints">
                  <span><kbd className="kbd-key">Space</kbd> Play/Pause</span>
                  <span><kbd className="kbd-key">←</kbd> <kbd className="kbd-key">→</kbd> Frame Step</span>
                  <span><kbd className="kbd-key">I</kbd> Mark In</span>
                  <span><kbd className="kbd-key">O</kbd> Mark Out</span>
                  <span><kbd className="kbd-key">M</kbd> Mute</span>
                  <span><kbd className="kbd-key">C</kbd> Cut/Split</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button className="toolbar-btn" onClick={onClose}>
            Cancel
          </button>

          <button
            className="split-action-btn"
            onClick={handleSave}
            style={{ width: 'auto', padding: '8px 20px' }}
          >
            <Check size={16} />
            <span>Apply & Save Clip Changes</span>
          </button>
        </div>
      </div>
    </div>
  );
};
