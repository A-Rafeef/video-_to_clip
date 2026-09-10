import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  FileVideo,
  Clock,
  Maximize2,
  Sliders,
  Scissors,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import type { VideoMetadata, SplitStrategyType } from '../types/video';
import { formatTimestamp, formatDurationHuman, formatFileSize, parseTimestamp, MAX_CLIP_DURATION_SECONDS } from '../utils/time';

interface SourceVideoPanelProps {
  videoMetadata: VideoMetadata | null;
  onVideoLoaded: (metadata: VideoMetadata) => void;
  splitStrategy: SplitStrategyType;
  onSplitStrategyChange: (strategy: SplitStrategyType) => void;
  customDuration: number;
  onCustomDurationChange: (sec: number) => void;
  manualTimestampsText: string;
  onManualTimestampsChange: (text: string) => void;
  onGenerateClips: () => void;
  isGenerating: boolean;
  totalClipsCount: number;
}

export const SourceVideoPanel: React.FC<SourceVideoPanelProps> = ({
  videoMetadata,
  onVideoLoaded,
  splitStrategy,
  onSplitStrategyChange,
  customDuration,
  onCustomDurationChange,
  manualTimestampsText,
  onManualTimestampsChange,
  onGenerateClips,
  isGenerating,
  totalClipsCount
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (!file) return;
    setErrorMessage(null);

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const validExtensions = ['mp4', 'mov', 'webm', 'mkv', 'm4v', 'avi'];
    if (!validExtensions.includes(ext) && !file.type.startsWith('video/')) {
      setErrorMessage(`Please upload a valid video file (${validExtensions.join(', ')}).`);
      return;
    }

    setLoadingVideo(true);
    // Use streaming Blob URL (does not load full gigabytes into JS RAM!)
    const objectUrl = URL.createObjectURL(file);

    const videoEl = document.createElement('video');
    videoEl.preload = 'metadata';
    videoEl.crossOrigin = 'anonymous';

    videoEl.onloadedmetadata = () => {
      // Estimate FPS: usually 30 or 60 unless detected
      const fps = 30;
      const metadata: VideoMetadata = {
        name: file.name,
        size: file.size,
        duration: videoEl.duration,
        width: videoEl.videoWidth,
        height: videoEl.videoHeight,
        fps,
        format: ext.toUpperCase(),
        file,
        url: objectUrl
      };
      setLoadingVideo(false);
      onVideoLoaded(metadata);
    };

    videoEl.onerror = () => {
      setLoadingVideo(false);
      setErrorMessage('Failed to read video metadata. The format may be unsupported by this browser.');
    };

    videoEl.src = objectUrl;
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  // Validate manual timestamps to ensure no segment exceeds 90s
  const getManualSegmentsValidation = () => {
    if (splitStrategy !== 'manual' || !videoMetadata) return null;
    const lines = manualTimestampsText.split('\n').filter((l) => l.trim().length > 0);
    let invalidCount = 0;
    lines.forEach((line) => {
      const parts = line.split('-').map((p) => p.trim());
      if (parts.length === 2) {
        const start = parseTimestamp(parts[0]);
        const end = parseTimestamp(parts[1]);
        if (start !== null && end !== null && end - start > MAX_CLIP_DURATION_SECONDS) {
          invalidCount++;
        }
      }
    });

    if (invalidCount > 0) {
      return `${invalidCount} segment(s) exceed the strict 90s limit and will be clamped.`;
    }
    return null;
  };

  const manualWarning = getManualSegmentsValidation();

  return (
    <div className="workspace-panel">
      <div className="panel-header">
        <div className="panel-title-group">
          <FileVideo size={18} color="var(--primary)" />
          <span className="panel-title">1. Source Video</span>
        </div>
        {videoMetadata && <span className="panel-badge">{videoMetadata.format}</span>}
      </div>

      <div className="panel-content">
        {/* Upload Dropzone */}
        {!videoMetadata ? (
          <div
            className={`upload-dropzone ${isDragging ? 'dragging' : ''}`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/*"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFile(e.target.files[0]);
                }
              }}
            />
            <div className="upload-icon-circle">
              <UploadCloud size={28} />
            </div>
            <div className="upload-title">
              {loadingVideo ? 'Analyzing Video...' : 'Drop your long video here'}
            </div>
            <div className="upload-subtitle">
              or click to browse from desktop. Handles large multi-gigabyte files locally.
            </div>
            <div className="upload-tags">
              <span className="tag-pill">MP4</span>
              <span className="tag-pill">MOV</span>
              <span className="tag-pill">WEBM</span>
              <span className="tag-pill">MKV</span>
            </div>
          </div>
        ) : (
          /* Video Loaded View */
          <>
            <div className="video-preview-wrapper">
              <video src={videoMetadata.url} controls playsInline />
            </div>

            <div className="video-meta-card">
              <div className="meta-header">
                <span className="meta-name" title={videoMetadata.name}>
                  {videoMetadata.name}
                </span>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="toolbar-btn"
                  style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                >
                  Change
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept="video/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFile(e.target.files[0]);
                    }
                  }}
                />
              </div>

              <div className="meta-grid">
                <div className="meta-item">
                  <span className="meta-label">Duration</span>
                  <span className="meta-val">{formatTimestamp(videoMetadata.duration, true)}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Resolution</span>
                  <span className="meta-val">
                    {videoMetadata.width} × {videoMetadata.height}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">File Size</span>
                  <span className="meta-val">{formatFileSize(videoMetadata.size)}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Framerate</span>
                  <span className="meta-val">~{videoMetadata.fps} FPS</span>
                </div>
              </div>
            </div>

            {/* Split Strategy Controls */}
            <div className="strategy-box">
              <div className="section-subtitle">
                <Sliders size={14} />
                <span>Split Strategy (Max 90s)</span>
              </div>

              <div className="strategy-options">
                <button
                  className={`strategy-btn ${splitStrategy === '90s' ? 'active' : ''}`}
                  onClick={() => onSplitStrategyChange('90s')}
                >
                  <Clock size={16} />
                  <span>90s (Max)</span>
                </button>

                <button
                  className={`strategy-btn ${splitStrategy === '60s' ? 'active' : ''}`}
                  onClick={() => onSplitStrategyChange('60s')}
                >
                  <Clock size={16} />
                  <span>60 Seconds</span>
                </button>

                <button
                  className={`strategy-btn ${splitStrategy === '30s' ? 'active' : ''}`}
                  onClick={() => onSplitStrategyChange('30s')}
                >
                  <Clock size={16} />
                  <span>30 Seconds</span>
                </button>

                <button
                  className={`strategy-btn ${splitStrategy === 'custom' ? 'active' : ''}`}
                  onClick={() => onSplitStrategyChange('custom')}
                >
                  <Sliders size={16} />
                  <span>Custom ({customDuration}s)</span>
                </button>

                <button
                  className={`strategy-btn strategy-full-btn ${splitStrategy === 'manual' ? 'active' : ''}`}
                  onClick={() => onSplitStrategyChange('manual')}
                >
                  <Scissors size={16} />
                  <span>Manual Timestamps (e.g. 01:23.500)</span>
                </button>
              </div>

              {/* Custom Duration Slider */}
              {splitStrategy === 'custom' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Interval:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--primary)' }}>
                      {customDuration}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="90"
                    step="1"
                    value={customDuration}
                    onChange={(e) => onCustomDurationChange(parseInt(e.target.value, 10))}
                    style={{ accentColor: 'var(--primary)' }}
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Enforced strict limit: max 90.0 seconds per clip.
                  </span>
                </div>
              )}

              {/* Manual Timestamps Text Area */}
              {splitStrategy === 'manual' && (
                <div className="manual-ts-box">
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Enter ranges one per line: <code>start - end</code> (e.g. <code>00:00.000 - 01:23.500</code>):
                  </span>
                  <textarea
                    className="manual-ts-input"
                    value={manualTimestampsText}
                    onChange={(e) => onManualTimestampsChange(e.target.value)}
                    placeholder="00:00.000 - 01:23.500&#10;01:23.500 - 02:45.000"
                  />
                  {manualWarning && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--accent-amber)' }}>
                      <AlertCircle size={14} />
                      <span>{manualWarning}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Split Action */}
              <button
                className="split-action-btn"
                onClick={onGenerateClips}
                disabled={isGenerating}
              >
                <Scissors size={16} />
                <span>
                  {isGenerating
                    ? 'Generating Thumbnails & Clips...'
                    : totalClipsCount > 0
                    ? `Re-split Clips (${totalClipsCount} existing)`
                    : 'Generate Split Clips'}
                </span>
              </button>
            </div>
          </>
        )}

        {errorMessage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: 'rgba(244, 63, 94, 0.15)', border: '1px solid var(--accent-rose)', borderRadius: 'var(--radius-sm)', color: '#fb7185', fontSize: '0.8rem' }}>
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};
