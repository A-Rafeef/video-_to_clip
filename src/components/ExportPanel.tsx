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
  Info,
  MonitorPlay
} from 'lucide-react';
import type {
  ClipItem,
  CompressionProfile,
  ExportProgress,
  VideoMetadata
} from '../types/video';
import { COMPRESSION_PROFILES, estimateClipSizeBytes, type EncodingEngine } from '../utils/videoProcessor';
import { isWebCodecsSupported } from '../utils/webCodecsProcessor';
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
  globalPlayerOverlayEnabled?: boolean;
  onToggleGlobalPlayerOverlay?: (enabled: boolean) => void;
  globalPlayerOverlayDuration?: number;
  onChangeGlobalPlayerOverlayDuration?: (sec: number) => void;
  exportConcurrency?: number;
  onConcurrencyChange?: (concurrency: number) => void;
  encodingEngine?: EncodingEngine;
  onEncodingEngineChange?: (engine: EncodingEngine) => void;
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
  sourceMetadata,
  globalPlayerOverlayEnabled = true,
  onToggleGlobalPlayerOverlay,
  globalPlayerOverlayDuration = 1.5,
  onChangeGlobalPlayerOverlayDuration,
  exportConcurrency = 2,
  onConcurrencyChange,
  encodingEngine = 'webcodecs',
  onEncodingEngineChange
}) => {
  const hasWebCodecs = isWebCodecsSupported();

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
        {/* Encoding Engine Selector */}
        <div className="export-section">
          <div className="section-subtitle">
            <Zap size={14} color="var(--accent-cyan)" />
            <span>Encoding Engine</span>
            {hasWebCodecs && (
              <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--accent-emerald)', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                GPU Hardware Ready
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
            <div
              className={`profile-card ${encodingEngine === 'lossless' ? 'active' : ''}`}
              onClick={() => !exportProgress.isExporting && onEncodingEngineChange?.('lossless')}
              style={{ border: encodingEngine === 'lossless' ? '1px solid var(--accent-emerald)' : undefined }}
            >
              <div className="profile-header">
                <span className="profile-label" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>
                  ⚡ Instant Lossless (0.05s • 1000x Speed)
                </span>
                {encodingEngine === 'lossless' && <CheckCircle2 size={16} color="var(--accent-emerald)" />}
              </div>
              <p className="profile-desc" style={{ fontSize: '0.74rem', color: '#cbd5e1' }}>
                Pure bitstream stream copy in milliseconds. Zero re-encoding, 0% quality loss. Ideal for instant movie splitting.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div
                className={`profile-card ${encodingEngine === 'webcodecs' ? 'active' : ''}`}
                onClick={() => !exportProgress.isExporting && onEncodingEngineChange?.('webcodecs')}
                style={{ opacity: hasWebCodecs ? 1 : 0.6 }}
              >
                <div className="profile-header">
                  <span className="profile-label" style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                    🚀 WebCodecs GPU
                  </span>
                  {encodingEngine === 'webcodecs' && <CheckCircle2 size={15} color="var(--accent-cyan)" />}
                </div>
                <p className="profile-desc" style={{ fontSize: '0.72rem' }}>
                  Hardware GPU encoding. Supports Anti-Copyright HUD & crops.
                </p>
              </div>

              <div
                className={`profile-card ${encodingEngine === 'mediarecorder' ? 'active' : ''}`}
                onClick={() => !exportProgress.isExporting && onEncodingEngineChange?.('mediarecorder')}
              >
                <div className="profile-header">
                  <span className="profile-label" style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                    MediaRecorder
                  </span>
                  {encodingEngine === 'mediarecorder' && <CheckCircle2 size={15} color="var(--primary)" />}
                </div>
                <p className="profile-desc" style={{ fontSize: '0.72rem' }}>
                  Standard browser recorder. Universal fallback.
                </p>
              </div>
            </div>
          </div>
        </div>

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

        {/* Anti-Copyright & Video Player HUD Overlay Card */}
        <div style={{ background: 'rgba(15, 23, 42, 0.45)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: 'var(--radius-md)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MonitorPlay size={16} color="var(--accent-cyan)" />
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f8fafc' }}>
                Video Player HUD Overlay (1-2s)
              </span>
            </div>
            <input
              type="checkbox"
              checked={globalPlayerOverlayEnabled}
              onChange={(e) => onToggleGlobalPlayerOverlay?.(e.target.checked)}
              style={{ accentColor: 'var(--accent-cyan)', width: '16px', height: '16px' }}
            />
          </div>

          <p style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
            Bypasses social media copyright fingerprinting and stops scrollers by rendering a player HUD (play button, scrubber bar, timecode) during the first 1-2s of each video.
          </p>

          {globalPlayerOverlayEnabled && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>Intro Duration:</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                {([1.0, 1.5, 2.0] as const).map((sec) => (
                  <button
                    key={sec}
                    className={`toolbar-btn ${globalPlayerOverlayDuration === sec ? 'active' : ''}`}
                    onClick={() => onChangeGlobalPlayerOverlayDuration?.(sec)}
                    style={{
                      padding: '3px 8px',
                      fontSize: '0.72rem',
                      background: globalPlayerOverlayDuration === sec ? 'var(--primary)' : 'rgba(0,0,0,0.3)',
                      color: globalPlayerOverlayDuration === sec ? '#fff' : 'var(--text-secondary)'
                    }}
                  >
                    {sec.toFixed(1)}s
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Hardware Acceleration & Parallel Speed Control */}
        <div style={{ background: 'rgba(15, 23, 42, 0.45)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 'var(--radius-md)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={16} color="var(--accent-emerald)" />
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f8fafc' }}>
                Hardware Acceleration & Speed
              </span>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--accent-emerald)', fontWeight: 600 }}>
              {exportConcurrency}x Parallel
            </span>
          </div>

          <p style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
            Processes multiple clips simultaneously using your GPU multi-core encoder to cut total export time dramatically.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', paddingTop: '4px' }}>
            {[
              { val: 1, label: '1x Safe' },
              { val: 2, label: '⚡ 2x Fast' },
              { val: 3, label: '🚀 3x Turbo' },
              { val: 4, label: '🔥 4x Extreme' }
            ].map(({ val, label }) => {
              const isCur = exportConcurrency === val;
              return (
                <button
                  key={val}
                  type="button"
                  className={`toolbar-btn ${isCur ? 'active' : ''}`}
                  onClick={() => onConcurrencyChange?.(val)}
                  style={{
                    justifyContent: 'center',
                    padding: '6px 2px',
                    fontSize: '0.72rem',
                    background: isCur ? 'var(--accent-emerald)' : 'rgba(0,0,0,0.3)',
                    color: isCur ? '#0f172a' : 'var(--text-secondary)',
                    fontWeight: isCur ? 700 : 500,
                    borderColor: isCur ? 'var(--accent-emerald)' : 'var(--border-subtle)'
                  }}
                >
                  {label}
                </button>
              );
            })}
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
