import React from 'react';
import {
  Download,
  Zap,
  CheckCircle2,
  Loader2,
  XCircle,
  Archive,
  Layers,
  CheckSquare,
  Square,
  Sparkles,
  ExternalLink,
  Scissors,
  Volume2,
  VolumeX,
  RotateCw,
  Crop,
  Trash2,
  CloudUpload,
  Cloud
} from 'lucide-react';
import type { ClipItem, ExportProgress, VideoMetadata } from '../types/video';
import type { EncodingEngine } from '../utils/videoProcessor';
import type { ZipResult } from './ExportModal';
import { formatDurationHuman, formatFileSize } from '../utils/time';

interface BottomActionDockProps {
  clips: ClipItem[];
  selectedClipIds: Set<string>;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBatchMuteToggle?: () => void;
  onBatchRotate?: () => void;
  onBatchCropRatio?: (preset: '16:9' | '9:16' | '1:1') => void;
  onBatchDelete?: () => void;
  exportProgress: ExportProgress;
  onStartExport: () => void;
  onCancelExport: () => void;
  onDownloadZip: () => void;
  zipResult: ZipResult | null;
  onOpenExportModal: () => void;
  encodingEngine: EncodingEngine;
  onEncodingEngineChange: (engine: EncodingEngine) => void;
  sourceMetadata: VideoMetadata | null;
  onGenerateClips?: () => void;
  isGenerating?: boolean;
}

export const BottomActionDock: React.FC<BottomActionDockProps> = ({
  clips,
  selectedClipIds,
  onSelectAll,
  onDeselectAll,
  onBatchMuteToggle,
  onBatchRotate,
  onBatchCropRatio,
  onBatchDelete,
  exportProgress,
  onStartExport,
  onCancelExport,
  onDownloadZip,
  zipResult,
  onOpenExportModal,
  encodingEngine,
  onEncodingEngineChange,
  sourceMetadata,
  onGenerateClips,
  isGenerating
}) => {
  const selectedClips = clips.filter((c) => selectedClipIds.has(c.id));
  const completedClips = selectedClips.filter((c) => c.status === 'completed' && c.processedBlob);
  const totalDuration = selectedClips.reduce((acc, c) => acc + c.duration, 0);
  const allSelected = clips.length > 0 && selectedClipIds.size === clips.length;
  const isExporting = exportProgress.isExporting;
  const hasFinishedZip = zipResult !== null;

  return (
    <div className="bottom-action-dock">
      <div className="bottom-dock-inner">
        {/* Left Section: Split trigger, Clip Counter & Batch Edit Tools */}
        <div className="dock-left-group">
          {/* Quick Split / Generate Button if video loaded */}
          {sourceMetadata && onGenerateClips && (
            <button
              className="dock-tool-btn primary"
              onClick={onGenerateClips}
              disabled={isGenerating || isExporting}
              title="Split source video into clips"
              style={{
                background: clips.length === 0 ? 'var(--primary)' : 'rgba(99, 102, 241, 0.2)',
                color: '#fff',
                borderColor: 'var(--primary)'
              }}
            >
              {isGenerating ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <Scissors size={14} />
              )}
              <span>{clips.length === 0 ? 'Split Video' : 'Re-Split'}</span>
            </button>
          )}

          {/* Clip Selection Badge */}
          <div className="dock-clip-badge">
            <Layers size={15} color="var(--primary)" />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="dock-badge-title">
                {selectedClips.length} of {clips.length} Selected
              </span>
              <span className="dock-badge-sub">
                {selectedClips.length > 0
                  ? formatDurationHuman(totalDuration)
                  : '0s'}
              </span>
            </div>
          </div>

          {/* Batch Quick Action Tools */}
          {clips.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                className="dock-tool-btn"
                onClick={allSelected ? onDeselectAll : onSelectAll}
                title={allSelected ? 'Deselect all clips' : 'Select all clips'}
              >
                {allSelected ? (
                  <CheckSquare size={13} color="var(--primary)" />
                ) : (
                  <Square size={13} />
                )}
                <span>{allSelected ? 'Deselect' : 'Select All'}</span>
              </button>

              {selectedClips.length > 0 && onBatchMuteToggle && (
                <button
                  className="dock-tool-btn"
                  onClick={onBatchMuteToggle}
                  title="Toggle Mute on selected clips"
                >
                  <VolumeX size={13} />
                  <span>Mute</span>
                </button>
              )}

              {selectedClips.length > 0 && onBatchRotate && (
                <button
                  className="dock-tool-btn"
                  onClick={onBatchRotate}
                  title="Rotate selected clips 90°"
                >
                  <RotateCw size={13} />
                  <span>Rotate</span>
                </button>
              )}

              {selectedClips.length > 0 && onBatchCropRatio && (
                <button
                  className="dock-tool-btn"
                  onClick={() => onBatchCropRatio('9:16')}
                  title="Crop selected clips to 9:16 Vertical (Reels/TikTok)"
                >
                  <Crop size={13} />
                  <span>9:16 Crop</span>
                </button>
              )}

              {selectedClips.length > 0 && onBatchDelete && (
                <button
                  className="dock-tool-btn danger"
                  onClick={onBatchDelete}
                  title="Delete selected clips"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Center Section: Live Process Bar OR Engine Selector & Status Pills */}
        <div className="dock-center-group">
          {isExporting ? (
            /* Live Progress Status Bar in Dock (Clicking opens the full Pop-Up Window) */
            <div className="dock-live-progress" onClick={onOpenExportModal}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '130px' }}>
                {exportProgress.isZipping ? (
                  <Archive size={16} color="var(--accent-cyan)" className="pulse" />
                ) : (
                  <Loader2 size={16} color="var(--primary)" className="spin" />
                )}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff' }}>
                    {exportProgress.isZipping
                      ? `Packaging ZIP: ${exportProgress.zipProgress}%`
                      : `Processing: ${exportProgress.overallProgress}%`}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    {exportProgress.isZipping
                      ? 'Creating ZIP Archive...'
                      : `Clip ${exportProgress.currentClipIndex + 1} of ${selectedClips.length}`}
                  </span>
                </div>
              </div>

              {/* Progress track */}
              <div className="dock-progress-track">
                <div
                  className="dock-progress-fill"
                  style={{
                    width: `${exportProgress.isZipping ? exportProgress.zipProgress : exportProgress.overallProgress}%`
                  }}
                />
              </div>

              {/* Button to view full pop-up window */}
              <button
                className="dock-tool-btn primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenExportModal();
                }}
                title="Open full processing pop-up window"
                style={{ padding: '4px 10px', fontSize: '0.74rem', background: 'var(--primary)', color: '#fff' }}
              >
                <span>Pop-Up Window</span>
                <ExternalLink size={12} />
              </button>

              <button
                className="dock-tool-btn danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelExport();
                }}
                title="Cancel processing"
                style={{ padding: '4px 8px', fontSize: '0.72rem' }}
              >
                <XCircle size={13} />
                <span>Cancel</span>
              </button>
            </div>
          ) : (
            /* Engine Switcher / Status Pill */
            <div className="dock-engine-selector">
              <div
                className={`dock-engine-pill ${encodingEngine === 'lossless' ? 'active' : ''}`}
                onClick={() => onEncodingEngineChange('lossless')}
                title="Instant bitstream copy in milliseconds. 1000x faster, 0% quality loss."
              >
                <Zap size={13} color="var(--accent-emerald)" />
                <span>⚡ Instant Lossless</span>
              </div>

              <div
                className={`dock-engine-pill ${encodingEngine === 'webcodecs' ? 'active' : ''}`}
                onClick={() => onEncodingEngineChange('webcodecs')}
                title="Hardware GPU encoding. Supports player HUD overlay & aspect ratio cropping."
              >
                <span>🚀 GPU WebCodecs</span>
              </div>

              {hasFinishedZip && (
                <div
                  className="dock-zip-ready-pill"
                  onClick={onOpenExportModal}
                  title="ZIP file is ready! Click to open download popup."
                >
                  <Sparkles size={13} color="var(--accent-emerald)" />
                  <span>ZIP Ready ({formatFileSize(zipResult.size)})</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Section: All Export, Download, Cloud Link, and Google Drive Buttons */}
        <div className="dock-right-group">
          {/* Main Process / Export Button (Immediately opens the Pop-Up Window) */}
          <button
            className="dock-primary-btn"
            onClick={onStartExport}
            disabled={selectedClips.length === 0 || isExporting}
            style={{
              background:
                encodingEngine === 'lossless'
                  ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                  : 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)'
            }}
            title="Start processing and open the live progress pop-up window"
          >
            <Zap size={16} />
            <span>
              {completedClips.length === selectedClips.length && selectedClips.length > 0
                ? 'Re-Process'
                : encodingEngine === 'lossless'
                ? `⚡ Instant Export (${selectedClips.length})`
                : `🚀 Turbo Export (${selectedClips.length})`}
            </span>
          </button>

          {/* Download ZIP Button (Opens Download Pop-Up Window) */}
          <button
            className={`dock-download-btn ${completedClips.length > 0 ? 'ready' : ''}`}
            onClick={onDownloadZip}
            disabled={completedClips.length === 0 || isExporting}
            title={
              completedClips.length > 0
                ? 'Open Download Pop-Up Window'
                : 'Process clips first'
            }
          >
            <Download size={15} />
            <span>
              {completedClips.length > 0
                ? `Download ZIP (${completedClips.length})`
                : 'Download ZIP'}
            </span>
          </button>

          {/* 1-Click Anonymous Cloud Button (Opens Download Pop-Up with Cloud Upload) */}
          <button
            className={`dock-tool-btn ${hasFinishedZip ? 'active' : ''}`}
            onClick={onOpenExportModal}
            disabled={completedClips.length === 0 || isExporting}
            title="1-Click Cloud Link with NO login needed"
            style={{
              borderColor: hasFinishedZip ? 'rgba(16, 185, 129, 0.4)' : undefined,
              color: hasFinishedZip ? '#34d399' : undefined
            }}
          >
            <Cloud size={14} color={hasFinishedZip ? 'var(--accent-emerald)' : 'var(--accent-cyan)'} />
            <span>Cloud Link</span>
          </button>

          {/* Google Drive Upload Button */}
          <button
            className="dock-tool-btn"
            onClick={onOpenExportModal}
            disabled={completedClips.length === 0 || isExporting}
            title="Upload directly to Google Drive"
          >
            <CloudUpload size={14} color="#38bdf8" />
            <span>Drive</span>
          </button>
        </div>
      </div>
    </div>
  );
};
