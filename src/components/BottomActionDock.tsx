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
  ExternalLink
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
  exportProgress: ExportProgress;
  onStartExport: () => void;
  onCancelExport: () => void;
  onDownloadZip: () => void;
  zipResult: ZipResult | null;
  onOpenExportModal: () => void;
  encodingEngine: EncodingEngine;
  onEncodingEngineChange: (engine: EncodingEngine) => void;
  sourceMetadata: VideoMetadata | null;
}

export const BottomActionDock: React.FC<BottomActionDockProps> = ({
  clips,
  selectedClipIds,
  onSelectAll,
  onDeselectAll,
  exportProgress,
  onStartExport,
  onCancelExport,
  onDownloadZip,
  zipResult,
  onOpenExportModal,
  encodingEngine,
  onEncodingEngineChange,
  sourceMetadata
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
        {/* Left Section: Selection summary & Quick Selection toggle */}
        <div className="dock-left-group">
          <div className="dock-clip-badge">
            <Layers size={16} color="var(--primary)" />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="dock-badge-title">
                {selectedClips.length} of {clips.length} Clips
              </span>
              <span className="dock-badge-sub">
                {selectedClips.length > 0
                  ? `Total: ${formatDurationHuman(totalDuration)}`
                  : 'Select clips to export'}
              </span>
            </div>
          </div>

          {clips.length > 0 && (
            <button
              className="dock-tool-btn"
              onClick={allSelected ? onDeselectAll : onSelectAll}
              title={allSelected ? 'Deselect all clips' : 'Select all clips'}
            >
              {allSelected ? (
                <CheckSquare size={14} color="var(--primary)" />
              ) : (
                <Square size={14} />
              )}
              <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
            </button>
          )}
        </div>

        {/* Center Section: Live Process Bar OR Engine Selector & Ready Pill */}
        <div className="dock-center-group">
          {isExporting ? (
            /* Live Progress Status Bar in Dock */
            <div className="dock-live-progress" onClick={onOpenExportModal}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '130px' }}>
                {exportProgress.isZipping ? (
                  <Archive size={16} color="var(--accent-cyan)" className="pulse" />
                ) : (
                  <Loader2 size={16} color="var(--primary)" className="spin" />
                )}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fff' }}>
                    {exportProgress.isZipping
                      ? `Zipping: ${exportProgress.zipProgress}%`
                      : `Processing: ${exportProgress.overallProgress}%`}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    {exportProgress.isZipping
                      ? 'Creating ZIP...'
                      : `Clip ${exportProgress.currentClipIndex + 1} of ${selectedClips.length}`}
                  </span>
                </div>
              </div>

              {/* Progress bar line */}
              <div className="dock-progress-track">
                <div
                  className="dock-progress-fill"
                  style={{
                    width: `${exportProgress.isZipping ? exportProgress.zipProgress : exportProgress.overallProgress}%`
                  }}
                />
              </div>

              <button
                className="dock-tool-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenExportModal();
                }}
                title="View full status window"
                style={{ padding: '4px 8px', fontSize: '0.72rem' }}
              >
                <span>View</span>
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
                  title="ZIP file is packaged and ready! Click to open download popup."
                >
                  <Sparkles size={13} color="var(--accent-emerald)" />
                  <span>ZIP Ready ({formatFileSize(zipResult.size)})</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Section: Main Process & Download Action Buttons */}
        <div className="dock-right-group">
          {/* Main Process / Export Button */}
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
          >
            <Zap size={16} />
            <span>
              {completedClips.length === selectedClips.length && selectedClips.length > 0
                ? 'Re-Process Clips'
                : encodingEngine === 'lossless'
                ? `⚡ Instant Export (${selectedClips.length})`
                : `🚀 Turbo Export (${selectedClips.length})`}
            </span>
          </button>

          {/* Download ZIP Button */}
          <button
            className={`dock-download-btn ${completedClips.length > 0 ? 'ready' : ''}`}
            onClick={onDownloadZip}
            disabled={completedClips.length === 0 || isExporting}
            title={
              completedClips.length > 0
                ? 'Download ZIP archive & open download window'
                : 'Process clips before downloading'
            }
          >
            <Download size={16} />
            <span>
              {completedClips.length > 0
                ? `Download ZIP (${completedClips.length} Ready)`
                : 'Download ZIP'}
            </span>
            {hasFinishedZip && (
              <span className="dock-btn-badge">
                {formatFileSize(zipResult.size)}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
