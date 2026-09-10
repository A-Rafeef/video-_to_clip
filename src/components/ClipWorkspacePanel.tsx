import React, { useState } from 'react';
import {
  Layers,
  CheckSquare,
  Square,
  Trash2,
  VolumeX,
  Volume2,
  Crop,
  RotateCw,
  Type,
  Edit3,
  Play,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  Info,
  MonitorPlay
} from 'lucide-react';
import type { ClipItem, VideoMetadata } from '../types/video';
import { formatTimestamp, formatDurationHuman, formatFileSize } from '../utils/time';
import { estimateClipSizeBytes } from '../utils/videoProcessor';

interface ClipWorkspacePanelProps {
  clips: ClipItem[];
  selectedClipIds: Set<string>;
  onToggleSelectClip: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onOpenEditor: (clip: ClipItem) => void;
  onQuickPreview: (clip: ClipItem) => void;
  onDeleteClip: (id: string) => void;
  onBatchDelete: () => void;
  onBatchMuteToggle: () => void;
  onBatchRotate: () => void;
  onBatchCropRatio: (ratio: '16:9' | '9:16' | '1:1') => void;
  onBatchTextOverlay: (text: string) => void;
  onBatchPlayerOverlayToggle?: () => void;
  onReorderClip: (fromIndex: number, toIndex: number) => void;
  onRetryClip: (clip: ClipItem) => void;
  sourceMetadata: VideoMetadata | null;
}

export const ClipWorkspacePanel: React.FC<ClipWorkspacePanelProps> = ({
  clips,
  selectedClipIds,
  onToggleSelectClip,
  onSelectAll,
  onDeselectAll,
  onOpenEditor,
  onQuickPreview,
  onDeleteClip,
  onBatchDelete,
  onBatchMuteToggle,
  onBatchRotate,
  onBatchCropRatio,
  onBatchTextOverlay,
  onBatchPlayerOverlayToggle,
  onReorderClip,
  onRetryClip,
  sourceMetadata
}) => {
  const [draggedClipIndex, setDraggedClipIndex] = useState<number | null>(null);
  const [showBatchTextPrompt, setShowBatchTextPrompt] = useState(false);
  const [batchTextValue, setBatchTextValue] = useState('');

  const allSelected = clips.length > 0 && selectedClipIds.size === clips.length;
  const someSelected = selectedClipIds.size > 0;
  const selectedClips = clips.filter((c) => selectedClipIds.has(c.id));
  const allSelectedHavePlayerOverlay =
    selectedClips.length > 0 &&
    selectedClips.every((c) => c.edits.playerOverlay?.enabled !== false);

  const handleDragStart = (index: number) => {
    setDraggedClipIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleDrop = (targetIndex: number) => {
    if (draggedClipIndex !== null && draggedClipIndex !== targetIndex) {
      onReorderClip(draggedClipIndex, targetIndex);
    }
    setDraggedClipIndex(null);
  };

  const submitBatchText = () => {
    if (batchTextValue.trim()) {
      onBatchTextOverlay(batchTextValue.trim());
      setBatchTextValue('');
      setShowBatchTextPrompt(false);
    }
  };

  return (
    <div className="workspace-panel">
      <div className="panel-header">
        <div className="panel-title-group">
          <Layers size={18} color="var(--accent-purple)" />
          <span className="panel-title">2. Clip Workspace</span>
        </div>
        <span className="panel-badge">
          {clips.length} {clips.length === 1 ? 'Clip' : 'Clips'}
        </span>
      </div>

      {/* Batch Actions Toolbar */}
      {clips.length > 0 && (
        <div className="batch-toolbar">
          <div className="batch-left">
            <button
              className="toolbar-btn"
              onClick={allSelected ? onDeselectAll : onSelectAll}
              title={allSelected ? 'Deselect All' : 'Select All'}
            >
              {allSelected ? <CheckSquare size={14} color="var(--primary)" /> : <Square size={14} />}
              <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              ({selectedClipIds.size} selected)
            </span>
          </div>

          <div className="batch-actions">
            <button
              className="toolbar-btn"
              disabled={!someSelected}
              onClick={onBatchMuteToggle}
              title="Toggle audio mute on selected clips"
            >
              <VolumeX size={14} />
              <span>Mute</span>
            </button>

            <button
              className="toolbar-btn"
              disabled={!someSelected}
              onClick={onBatchRotate}
              title="Rotate selected clips 90 degrees"
            >
              <RotateCw size={14} />
              <span>Rotate 90°</span>
            </button>

            <button
              className="toolbar-btn"
              disabled={!someSelected}
              onClick={() => onBatchCropRatio('9:16')}
              title="Batch Crop to 9:16 Vertical / Reels"
            >
              <Crop size={14} />
              <span>9:16 Reel</span>
            </button>

            <button
              className="toolbar-btn"
              disabled={!someSelected}
              onClick={() => setShowBatchTextPrompt(!showBatchTextPrompt)}
              title="Add text overlay watermark to selected clips"
            >
              <Type size={14} />
              <span>Text</span>
            </button>

            <button
              className="toolbar-btn"
              disabled={!someSelected}
              onClick={onBatchPlayerOverlayToggle}
              title="Toggle 1-2s Video Player HUD Overlay on selected clips (Anti-Copyright)"
              style={{
                color: allSelectedHavePlayerOverlay ? 'var(--accent-cyan)' : undefined,
                borderColor: allSelectedHavePlayerOverlay ? 'var(--accent-cyan)' : undefined
              }}
            >
              <MonitorPlay size={14} />
              <span>Player HUD</span>
            </button>

            <button
              className="toolbar-btn danger"
              disabled={!someSelected}
              onClick={onBatchDelete}
              title="Delete selected clips"
            >
              <Trash2 size={14} />
              <span>Delete</span>
            </button>
          </div>
        </div>
      )}

      {/* Batch Text Prompt Modal/Dropdown */}
      {showBatchTextPrompt && (
        <div style={{ padding: '10px 16px', background: 'rgba(99, 102, 241, 0.1)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Watermark text for selected clips..."
            value={batchTextValue}
            onChange={(e) => setBatchTextValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitBatchText()}
            style={{ flex: 1, padding: '6px 10px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-subtle)', borderRadius: '4px', color: '#fff', fontSize: '0.8rem', outline: 'none' }}
          />
          <button className="toolbar-btn" onClick={submitBatchText} style={{ background: 'var(--primary)', color: '#fff' }}>
            Apply
          </button>
          <button className="toolbar-btn" onClick={() => setShowBatchTextPrompt(false)}>
            Cancel
          </button>
        </div>
      )}

      {/* Clips Grid / Empty State */}
      {clips.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px', color: 'var(--text-muted)', textAlign: 'center', gap: '12px' }}>
          <Layers size={48} strokeWidth={1.5} color="var(--border-focus)" />
          <div style={{ fontSize: '1rem', color: '#e2e8f0', fontWeight: 600 }}>
            No Clips Generated Yet
          </div>
          <div style={{ fontSize: '0.82rem', maxWidth: '320px', lineHeight: 1.4 }}>
            Upload a video in Panel 1, pick your splitting strategy (up to 90s each), and click <strong>Generate Split Clips</strong>.
          </div>
        </div>
      ) : (
        <div className="clips-scroll-container">
          {clips.map((clip, index) => {
            const isSelected = selectedClipIds.has(clip.id);
            const estSize = estimateClipSizeBytes(clip.duration, 'balanced');
            const resDisplay = sourceMetadata ? `${sourceMetadata.width}×${sourceMetadata.height}` : 'HD';

            return (
              <div
                key={clip.id}
                className={`clip-card ${isSelected ? 'selected' : ''}`}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={() => handleDrop(index)}
              >
                {/* Thumbnail Header Area */}
                <div className="clip-thumbnail-area" onClick={() => onQuickPreview(clip)}>
                  <input
                    type="checkbox"
                    className="clip-select-box"
                    checked={isSelected}
                    onChange={(e) => {
                      e.stopPropagation();
                      onToggleSelectClip(clip.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />

                  <img
                    src={clip.thumbnail}
                    alt={`Clip #${index + 1}`}
                    className="clip-thumbnail-img"
                    loading="lazy"
                  />

                  <div className="clip-overlay-duration">
                    {formatDurationHuman(clip.duration)}
                  </div>

                  {/* Status Badge */}
                  <span className={`clip-status-indicator status-${clip.status}`}>
                    {clip.status}
                  </span>
                </div>

                {/* Body Info */}
                <div className="clip-info-body">
                  <div className="clip-title-row">
                    <span className="clip-part-title">Clip #{index + 1}</span>
                    <span className="clip-timecodes">
                      {formatTimestamp(clip.startTime)} → {formatTimestamp(clip.endTime)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    <span>{resDisplay}</span>
                    <span>~{formatFileSize(clip.actualSizeBytes || estSize)}</span>
                  </div>

                  {/* Applied Edits Badges */}
                  <div className="clip-edits-tags">
                    {clip.edits.mute && <span className="edit-tag">Muted</span>}
                    {clip.edits.rotation !== 0 && <span className="edit-tag">{clip.edits.rotation}°</span>}
                    {clip.edits.crop && <span className="edit-tag">Cropped</span>}
                    {clip.edits.textOverlay?.text && <span className="edit-tag">Text Overlay</span>}
                    {clip.edits.playerOverlay?.enabled !== false && (
                      <span className="edit-tag" style={{ color: 'var(--accent-cyan)', borderColor: 'rgba(6,182,212,0.4)', background: 'rgba(6,182,212,0.1)' }}>
                        HUD {clip.edits.playerOverlay?.durationSec ?? 1.5}s
                      </span>
                    )}
                  </div>

                  {/* Processing Progress Bar if Processing */}
                  {clip.status === 'processing' && (
                    <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${clip.progress}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.2s' }} />
                    </div>
                  )}

                  {/* Actions Row */}
                  <div className="clip-actions-row">
                    <button
                      className="clip-btn"
                      onClick={() => onQuickPreview(clip)}
                      title="Quick Preview this clip"
                    >
                      <Play size={12} />
                      <span>Preview</span>
                    </button>

                    <button
                      className="clip-btn edit-btn"
                      onClick={() => onOpenEditor(clip)}
                      title="Edit clip (Trim, Crop, Rotate, Text)"
                    >
                      <Edit3 size={12} />
                      <span>Edit</span>
                    </button>

                    {clip.status === 'failed' && (
                      <button
                        className="clip-btn"
                        onClick={() => onRetryClip(clip)}
                        title="Retry processing this clip"
                        style={{ color: 'var(--accent-amber)' }}
                      >
                        <RotateCcw size={12} />
                        <span>Retry</span>
                      </button>
                    )}

                    {/* Reorder Buttons */}
                    <button
                      className="clip-btn"
                      disabled={index === 0}
                      onClick={() => onReorderClip(index, index - 1)}
                      title="Move clip up"
                      style={{ flex: '0 0 26px', padding: '4px' }}
                    >
                      <ArrowUp size={12} />
                    </button>

                    <button
                      className="clip-btn"
                      disabled={index === clips.length - 1}
                      onClick={() => onReorderClip(index, index + 1)}
                      title="Move clip down"
                      style={{ flex: '0 0 26px', padding: '4px' }}
                    >
                      <ArrowDown size={12} />
                    </button>

                    <button
                      className="clip-btn delete-btn"
                      onClick={() => onDeleteClip(clip.id)}
                      title="Delete this clip"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
