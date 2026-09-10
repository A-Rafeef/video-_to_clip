export interface VideoMetadata {
  name: string;
  size: number;
  duration: number; // in seconds
  width: number;
  height: number;
  fps: number;
  format: string;
  file: File;
  url: string;
}

export type SplitStrategyType = '90s' | '60s' | '30s' | 'custom' | 'manual';

export interface CropSettings {
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio: 'free' | '16:9' | '9:16' | '1:1' | '4:5';
}

export interface TextOverlaySettings {
  text: string;
  position: 'top' | 'center' | 'bottom';
  fontSize: number;
  color: string;
  bgColor: string;
  showBg: boolean;
}

export interface ClipEditState {
  startTime: number;
  endTime: number;
  crop: CropSettings | null;
  rotation: 0 | 90 | 180 | 270;
  mute: boolean;
  textOverlay: TextOverlaySettings | null;
}

export type ClipStatus = 'waiting' | 'processing' | 'completed' | 'failed';

export interface ClipItem {
  id: string;
  originalIndex: number;
  startTime: number;
  endTime: number;
  duration: number; // strictly <= 90s
  thumbnail: string;
  status: ClipStatus;
  progress: number; // 0 to 100
  error?: string;
  edits: ClipEditState;
  history: ClipEditState[];
  historyIndex: number;
  processedBlob?: Blob;
  processedUrl?: string;
  estimatedSizeBytes?: number;
  actualSizeBytes?: number;
}

export type CompressionProfile = 'original' | 'balanced' | 'small';

export interface CompressionProfileConfig {
  id: CompressionProfile;
  label: string;
  description: string;
  videoBitrate: number; // bps
  audioBitrate: number; // bps
  maxDimension?: number;
  crfEstimateMultiplier: number;
}

export interface ExportProgress {
  isExporting: boolean;
  currentClipIndex: number;
  totalClips: number;
  overallProgress: number;
  currentClipProgress: number;
  startTime: number;
  elapsedSeconds: number;
  estimatedRemainingSec: number;
  isZipping: boolean;
  zipProgress: number;
  zipBlob?: Blob;
  isCancelled: boolean;
}

export interface StorageEstimateInfo {
  quota: number;
  usage: number;
  available: number;
  isLow: boolean;
}
