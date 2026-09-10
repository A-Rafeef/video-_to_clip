import React from 'react';
import {
  Download,
  Archive,
  Sliders,
  CheckCircle2,
  Clock,
  HardDrive,
  XCircle,
  FileCheck,
  Zap,
  Info
} from 'lucide-react';
import type {
  ClipItem,
  CompressionProfile,
  ExportProgress,
  VideoMetadata
} from '../types/video';
import { COMPRESSION_PROFILES, estimateClipSizeBytes } from '../utils/videoProcessor';
import { formatTimestamp, formatFileSize, formatDurationHuman } from '../utils/time';

interface ExportPanelProps {
  projectName: string;
  clips: ClipItem[];
  selectedClipIds: Set<string>;
  compressionProfile: CompressionProfile;
  onProfileChange: (p: CompressionProfile) => void;
  exportProgress: ExportProgress;
  onStartExport: () => void;
  onCancelExport: () => void;
  onDownloadZip: () => void;
  includeManifest: boolean;
  onToggleManifest: (inc: boolean) => void;
  sourceMetadata: VideoMetadata | null;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  projectName,
  clips,
  selectedClipIds,
  compressionProfile,
  onProfileChange,
  exportProgress,
  onStartExport,
  onCancelExport,
  onDownloadZip,
  includeManifest,
  onToggleManifest,
  sourceMetadata
}) => {
  // Selected clips in chronological order
  const selectedClips = clips.filter((c) => selectedClipIds.has(c.id));
  const totalSelectedDuration = selectedClips.reduce((acc, c) => acc + c.duration, 0);

  // Calculate estimated total output size for selected clips
  const estimatedOutputBytes = selectedClips.reduce((acc, c) => {
    return acc + estimateClipSizeBytes(c.duration, compressionProfile);
  }, 0);

  const cleanProject = (projectName || 'ClipForge-Export').trim();
  const completedCount = selectedClips.filter((c) => c.status === 'completed').length;
  const remainingCount = selectedClips.length - completedCount;

  return (
    <div className="workspace-panel">
      <div className="panel-header">
        <div className="panel-title-group">
          <Archive size={18} color="var(--accent-cyan)" />
          <span className="panel-title">3. Export & ZIP</span>
        </div>
        <span className="panel-badge">
          {selectedClips.length} Selected
        </span>
      </div>

      <div className="panel-content">
        {/* Quality Profiles */}
        <div className="export-section">
          <div className="section-subtitle">
            <Sliders size={14} />
            <span>Compression Profile</span>
          </div>

          {(['original', 'balanced', 'small'] as const).map((profKey) => {
            const config = COMPRESSION_PROFILES[profKey];
            const isActive = compressionProfile === profKey;

            return (
              <div
                key={profKey}
                className={`profile-card ${isActive ? 'active' : ''}`}
                onClick={() => !exportProgress.isExporting && onProfileChange(profKey)}
              >
                <div className="profile-header">
                  <span className="profile-label">{config.label}</span>
                  {isActive && <CheckCircle2 size={16} color="var(--primary)" />}
                </div>
                <p className="profile-desc">{config.description}</p>
              </div>
            );
          })}
        </div>

        {/* Output File Naming & Sequential Preview */}
        <div className="export-summary-box">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0' }}>
            <FileCheck size={14} color="var(--accent-cyan)" />
            <span>Sequential File Naming Preview:</span>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.4)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {selectedClips.length > 0 ? (
              <>
                <span>📁 {cleanProject}-Part-1.mp4</span>
                {selectedClips.length > 1 && <span>📁 {cleanProject}-Part-2.mp4</span>}
                {selectedClips.length > 2 && (
                  <span style={{ color: 'var(--text-muted)' }}>
                    ... and up to {cleanProject}-Part-{selectedClips.length}.mp4
                  </span>
                )}
              </>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>No clips selected yet</span>
            )}
          </div>

          <div className="summary-row">
            <span className="summary-label">Selected Clips:</span>
            <span className="summary-val">{selectedClips.length}</span>
          </div>

          <div className="summary-row">
            <span className="summary-label">Total Duration:</span>
            <span className="summary-val">{formatDurationHuman(totalSelectedDuration)}</span>
          </div>

          <div className="summary-row">
            <span className="summary-label">Est. Compressed Size:</span>
            <span className="summary-val" style={{ color: 'var(--accent-cyan)' }}>
              ~{formatFileSize(estimatedOutputBytes)}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid var(--border-subtle)', fontSize: '0.78rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Include manifest.json:</span>
            <input
              type="checkbox"
              checked={includeManifest}
              onChange={(e) => onToggleManifest(e.target.checked)}
              style={{ accentColor: 'var(--primary)' }}
            />
          </div>
        </div>

        {/* Live Export Progress Card (when exporting) */}
        {exportProgress.isExporting && (
          <div className="progress-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>
                {exportProgress.isZipping ? 'Packaging ZIP Archive...' : 'Encoding & Compressing Clips...'}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                {exportProgress.isZipping ? `${exportProgress.zipProgress}%` : `${exportProgress.overallProgress}%`}
              </span>
            </div>

            {/* Overall Progress Bar */}
            <div className="progress-bar-bg">
              <div
                className="progress-bar-fill"
                style={{
                  width: `${exportProgress.isZipping ? exportProgress.zipProgress : exportProgress.overallProgress}%`
                }}
              />
            </div>

            {/* Statistics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', fontSize: '0.75rem' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Clip: </span>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#fff' }}>
                  {exportProgress.currentClipIndex + 1} of {exportProgress.totalClips}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Current: </span>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#fff' }}>
                  {exportProgress.currentClipProgress.toFixed(0)}%
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Elapsed: </span>
                <span style={{ fontFamily: 'var(--font-mono)', color: '#cbd5e1' }}>
                  {exportProgress.elapsedSeconds}s
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Remaining: </span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)' }}>
                  ~{exportProgress.estimatedRemainingSec}s
                </span>
              </div>
            </div>

            <button
              className="toolbar-btn danger"
              onClick={onCancelExport}
              style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}
            >
              <XCircle size={14} />
              <span>Cancel Processing</span>
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: 'auto' }}>
          {!exportProgress.isExporting && (
            <button
              className="split-action-btn"
              onClick={onStartExport}
              disabled={selectedClips.length === 0}
            >
              <Zap size={16} />
              <span>
                {completedCount === selectedClips.length && selectedClips.length > 0
                  ? 'Re-process & Package ZIP'
                  : `Process & Export ${selectedClips.length} Clips`}
              </span>
            </button>
          )}

          {/* Download ZIP button */}
          <button
            className="toolbar-btn"
            onClick={onDownloadZip}
            disabled={completedCount === 0 || exportProgress.isExporting}
            style={{
              padding: '12px',
              justifyContent: 'center',
              background: completedCount > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.05)',
              borderColor: completedCount > 0 ? 'var(--accent-emerald)' : 'var(--border-subtle)',
              color: completedCount > 0 ? '#34d399' : 'var(--text-muted)',
              fontSize: '0.88rem'
            }}
          >
            <Download size={16} />
            <span>
              {completedCount > 0
                ? `Download ZIP (${completedCount} Ready)`
                : 'Download ZIP (Complete processing first)'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
