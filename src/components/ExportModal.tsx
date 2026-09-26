import React, { useState } from 'react';
import {
  Download,
  CheckCircle2,
  Clock,
  Zap,
  Archive,
  Film,
  X,
  Loader2,
  XCircle,
  Minimize2,
  Maximize2,
  Play,
  FileCheck,
  Sparkles,
  HardDrive
} from 'lucide-react';
import type { ClipItem, ExportProgress, VideoMetadata } from '../types/video';
import type { EncodingEngine } from '../utils/videoProcessor';
import { formatTimestamp, formatFileSize, formatDurationHuman } from '../utils/time';
import { triggerFileDownload } from '../utils/zipPackager';

export interface ZipResult {
  blob: Blob;
  filename: string;
  size: number;
}

interface ExportModalProps {
  isOpen: boolean;
  isMinimized: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onRestore: () => void;
  exportProgress: ExportProgress;
  onCancelExport: () => void;
  clips: ClipItem[];
  selectedClipIds: Set<string>;
  sourceMetadata: VideoMetadata | null;
  projectName: string;
  encodingEngine: EncodingEngine;
  zipResult: ZipResult | null;
  onQuickPreview?: (clip: ClipItem) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  isMinimized,
  onClose,
  onMinimize,
  onRestore,
  exportProgress,
  onCancelExport,
  clips,
  selectedClipIds,
  sourceMetadata,
  projectName,
  encodingEngine,
  zipResult,
  onQuickPreview
}) => {
  const [downloadedZip, setDownloadedZip] = useState(false);
  const [downloadedClipIds, setDownloadedClipIds] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const selectedClips = clips.filter((c) => selectedClipIds.has(c.id));
  const completedClips = selectedClips.filter((c) => c.status === 'completed' && c.processedBlob);
  const isFinished = !exportProgress.isExporting && zipResult !== null;
  const totalDuration = selectedClips.reduce((acc, c) => acc + c.duration, 0);
  const cleanProjectName = (projectName || 'ClipForge-Export').trim().replace(/[/\\?%*:|"<>]/g, '-');

  // Trigger main ZIP download
  const handleDownloadZip = () => {
    if (!zipResult) return;
    triggerFileDownload(zipResult.blob, zipResult.filename);
    setDownloadedZip(true);
  };

  // Trigger single clip download
  const handleDownloadSingleClip = (clip: ClipItem, index: number) => {
    if (!clip.processedBlob) return;
    const ext = clip.processedBlob.type.includes('webm') ? 'webm' : 'mp4';
    const filename = `${cleanProjectName}-Part-${index + 1}.${ext}`;
    triggerFileDownload(clip.processedBlob, filename);
    setDownloadedClipIds((prev) => new Set(prev).add(clip.id));
  };

  // If minimized, display the floating bottom-right bar
  if (isMinimized) {
    return (
      <div className="export-minimized-hud" onClick={onRestore}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isFinished ? (
            <div className="export-hud-pulse success">
              <CheckCircle2 size={16} color="var(--accent-emerald)" />
            </div>
          ) : exportProgress.isZipping ? (
            <div className="export-hud-pulse zipping">
              <Archive size={16} color="var(--accent-cyan)" />
            </div>
          ) : (
            <div className="export-hud-pulse active">
              <Loader2 size={16} className="spin" color="var(--primary)" />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>
              {isFinished
                ? 'ZIP Ready to Download!'
                : exportProgress.isZipping
                ? `Creating ZIP: ${exportProgress.zipProgress}%`
                : `Exporting: ${exportProgress.overallProgress}% (${exportProgress.currentClipIndex + 1}/${selectedClips.length})`}
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
              {isFinished ? 'Click to open download window' : 'Click to view full progress'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isFinished && zipResult && (
            <button
              className="export-hud-btn success"
              onClick={(e) => {
                e.stopPropagation();
                handleDownloadZip();
              }}
              title="Download ZIP"
            >
              <Download size={14} />
              <span>Download</span>
            </button>
          )}

          {!isFinished && exportProgress.isExporting && (
            <button
              className="export-hud-btn danger"
              onClick={(e) => {
                e.stopPropagation();
                onCancelExport();
              }}
              title="Cancel Export"
            >
              <XCircle size={14} />
            </button>
          )}

          <button className="export-hud-btn" onClick={onRestore} title="Expand Window">
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 120 }}>
      <div
        className="modal-container export-modal-container"
        style={{ maxWidth: '680px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="modal-header">
          <div className="modal-title">
            {isFinished ? (
              <>
                <div className="export-header-icon success">
                  <Sparkles size={18} color="var(--accent-emerald)" />
                </div>
                <span>Export Complete & Packaged</span>
              </>
            ) : exportProgress.isZipping ? (
              <>
                <div className="export-header-icon zipping">
                  <Archive size={18} color="var(--accent-cyan)" />
                </div>
                <span>Packaging ZIP Archive...</span>
              </>
            ) : (
              <>
                <div className="export-header-icon active">
                  <Loader2 size={18} className="spin" color="var(--primary)" />
                </div>
                <span>Exporting & Trimming Video Clips...</span>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="toolbar-btn"
              onClick={onMinimize}
              title="Minimize to background bar"
              style={{ padding: '6px' }}
            >
              <Minimize2 size={15} />
            </button>
            <button
              className="toolbar-btn"
              onClick={() => {
                if (exportProgress.isExporting) {
                  if (window.confirm('Export is still in progress. Cancel export and close?')) {
                    onCancelExport();
                    onClose();
                  }
                } else {
                  onClose();
                }
              }}
              title="Close window"
              style={{ padding: '6px' }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Multi-Step Pipeline Indicator */}
        <div className="export-stepper">
          <div className={`step-item ${exportProgress.isExporting && !exportProgress.isZipping ? 'active' : completedClips.length > 0 ? 'completed' : ''}`}>
            <div className="step-circle">
              {completedClips.length === selectedClips.length && selectedClips.length > 0 ? (
                <CheckCircle2 size={14} />
              ) : (
                '1'
              )}
            </div>
            <span className="step-label">Convert Clips</span>
          </div>

          <div className={`step-line ${exportProgress.isZipping || isFinished ? 'filled' : ''}`} />

          <div className={`step-item ${exportProgress.isZipping ? 'active' : isFinished ? 'completed' : ''}`}>
            <div className="step-circle">
              {isFinished ? <CheckCircle2 size={14} /> : '2'}
            </div>
            <span className="step-label">Package ZIP</span>
          </div>

          <div className={`step-line ${isFinished ? 'filled' : ''}`} />

          <div className={`step-item ${isFinished ? 'active completed' : ''}`}>
            <div className="step-circle">
              {isFinished ? <Download size={14} /> : '3'}
            </div>
            <span className="step-label">Download Ready</span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ gap: '18px', padding: '20px 24px' }}>
          {/* Active Processing & Zipping State */}
          {!isFinished && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Primary Progress Status Bar */}
              <div className="export-status-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {exportProgress.isZipping ? (
                      <Archive size={16} color="var(--accent-cyan)" />
                    ) : (
                      <Zap size={16} color="var(--accent-emerald)" />
                    )}
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>
                      {exportProgress.isZipping
                        ? 'Creating Compressed ZIP Archive'
                        : `Processing Clip ${exportProgress.currentClipIndex + 1} of ${selectedClips.length}`}
                    </span>
                  </div>
                  <span className="export-percent-badge">
                    {exportProgress.isZipping ? `${exportProgress.zipProgress}%` : `${exportProgress.overallProgress}%`}
                  </span>
                </div>

                {/* Animated Glowing Progress Bar */}
                <div className="export-bar-track">
                  <div
                    className={`export-bar-fill ${exportProgress.isZipping ? 'zipping' : 'active'}`}
                    style={{
                      width: `${exportProgress.isZipping ? exportProgress.zipProgress : exportProgress.overallProgress}%`
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                  <span>
                    {exportProgress.isZipping
                      ? 'Bundling videos and manifest.json into ZIP...'
                      : `Current clip progress: ${exportProgress.currentClipProgress.toFixed(0)}%`}
                  </span>
                  <span>
                    {exportProgress.isZipping ? 'Step 2 of 2' : `${completedClips.length} of ${selectedClips.length} finished`}
                  </span>
                </div>
              </div>

              {/* Statistics Grid */}
              <div className="export-stats-grid">
                <div className="stat-box">
                  <span className="stat-label">Elapsed Time</span>
                  <span className="stat-value">{exportProgress.elapsedSeconds}s</span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">Estimated Remaining</span>
                  <span className="stat-value" style={{ color: 'var(--accent-emerald)' }}>
                    {exportProgress.isZipping ? '~1s' : `~${exportProgress.estimatedRemainingSec}s`}
                  </span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">Clips Processed</span>
                  <span className="stat-value">
                    {completedClips.length} / {selectedClips.length}
                  </span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">Engine</span>
                  <span className="stat-value" style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>
                    {encodingEngine === 'lossless' ? '⚡ Instant Lossless' : '🚀 GPU WebCodecs'}
                  </span>
                </div>
              </div>

              {/* Live Clips Status Tracker List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Clips Queue Status:
                </span>
                <div className="export-clip-list-scroll">
                  {selectedClips.map((clip, idx) => {
                    const isCurrent = clip.status === 'processing';
                    const isDone = clip.status === 'completed';
                    const isFailed = clip.status === 'failed';

                    return (
                      <div
                        key={clip.id}
                        className={`export-clip-row ${isCurrent ? 'current' : isDone ? 'done' : ''}`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '90px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fff' }}>
                            Part {idx + 1}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {formatDurationHuman(clip.duration)}
                          </span>
                        </div>

                        {/* Progress mini bar */}
                        <div style={{ flex: 1, margin: '0 12px' }}>
                          <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: isDone ? '100%' : `${clip.progress || 0}%`,
                                height: '100%',
                                background: isDone ? 'var(--accent-emerald)' : 'var(--primary)',
                                transition: 'width 0.2s'
                              }}
                            />
                          </div>
                        </div>

                        {/* Status icon & label */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '80px', justifyContent: 'flex-end' }}>
                          {isDone && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                              <CheckCircle2 size={13} /> Ready
                            </span>
                          )}
                          {isCurrent && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                              <Loader2 size={13} className="spin" /> {clip.progress || 0}%
                            </span>
                          )}
                          {!isDone && !isCurrent && !isFailed && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={13} /> Waiting
                            </span>
                          )}
                          {isFailed && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--accent-rose)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <XCircle size={13} /> Error
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Finished Download Pop-Up State */}
          {isFinished && zipResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Success Hero Banner */}
              <div className="download-hero-card">
                <div className="hero-icon-glow">
                  <FileCheck size={32} color="#10b981" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                    ZIP Archive Created Successfully!
                  </h3>
                  <p style={{ fontSize: '0.82rem', color: '#cbd5e1', margin: 0, lineHeight: 1.4 }}>
                    All clips have been cut, named sequentially (<code style={{ color: 'var(--accent-cyan)' }}>Part-1.mp4</code>, <code style={{ color: 'var(--accent-cyan)' }}>Part-2.mp4</code>...), and packed with metadata.
                  </p>
                </div>
              </div>

              {/* ZIP Overview Card */}
              <div className="zip-overview-box">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="zip-box-icon">
                      <Archive size={24} color="var(--accent-cyan)" />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                        {zipResult.filename}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        <span>{completedClips.length} Clips</span>
                        <span>•</span>
                        <span>{formatDurationHuman(totalDuration)} Total</span>
                        <span>•</span>
                        <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>{formatFileSize(zipResult.size)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Primary Download CTA Button */}
                <button
                  className="download-cta-btn"
                  onClick={handleDownloadZip}
                >
                  <Download size={20} />
                  <span>
                    {downloadedZip ? 'Download ZIP Again' : 'Download ZIP Archive'}
                  </span>
                  <span className="download-size-pill">
                    {formatFileSize(zipResult.size)}
                  </span>
                </button>
              </div>

              {/* Individual Clips Download Option */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f8fafc' }}>
                    Individual Clip Downloads:
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Download or preview single clips directly
                  </span>
                </div>

                <div className="individual-clips-container">
                  {completedClips.map((clip, index) => {
                    const isDownloaded = downloadedClipIds.has(clip.id);
                    const ext = clip.processedBlob?.type.includes('webm') ? 'webm' : 'mp4';
                    const clipName = `${cleanProjectName}-Part-${index + 1}.${ext}`;

                    return (
                      <div key={clip.id} className="single-clip-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className="clip-part-badge">
                            Part {index + 1}
                          </span>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff' }}>
                              {clipName}
                            </span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                              {formatTimestamp(clip.startTime)} → {formatTimestamp(clip.endTime)} ({formatDurationHuman(clip.duration)}) • {clip.processedBlob ? formatFileSize(clip.processedBlob.size) : 'Ready'}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {onQuickPreview && (
                            <button
                              className="clip-btn"
                              onClick={() => onQuickPreview(clip)}
                              title="Preview this clip"
                              style={{ padding: '6px 10px', fontSize: '0.72rem' }}
                            >
                              <Play size={12} />
                              <span>Play</span>
                            </button>
                          )}

                          <button
                            className={`clip-btn ${isDownloaded ? 'edit-btn' : ''}`}
                            onClick={() => handleDownloadSingleClip(clip, index)}
                            title="Download this single clip"
                            style={{ padding: '6px 12px', fontSize: '0.72rem', color: isDownloaded ? 'var(--accent-emerald)' : undefined }}
                          >
                            <Download size={12} />
                            <span>{isDownloaded ? 'Saved' : 'Download'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <div>
            {!isFinished && exportProgress.isExporting && (
              <button
                className="toolbar-btn danger"
                onClick={onCancelExport}
                style={{ padding: '8px 16px', fontSize: '0.8rem' }}
              >
                <XCircle size={15} />
                <span>Cancel Processing</span>
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              className="toolbar-btn"
              onClick={onClose}
              style={{ padding: '8px 18px', fontSize: '0.82rem' }}
            >
              {isFinished ? 'Done & Close' : 'Close to Background'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
