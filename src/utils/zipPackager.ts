import JSZip from 'jszip';
import type { ClipItem, VideoMetadata } from '../types/video';
import { formatTimestamp } from './time';

export interface PackageZipOptions {
  projectName: string;
  clips: ClipItem[];
  sourceMetadata?: VideoMetadata | null;
  includeManifest?: boolean;
  onProgress?: (percent: number) => void;
}

export async function packageClipsToZip({
  projectName,
  clips,
  sourceMetadata,
  includeManifest = true,
  onProgress
}: PackageZipOptions): Promise<{ zipBlob: Blob; zipFilename: string }> {
  const zip = new JSZip();
  const cleanProjectName = (projectName || 'ClipForge-Export').trim().replace(/[/\\?%*:|"<>]/g, '-');

  // Filter only completed clips with blobs
  const validClips = clips.filter((c) => c.processedBlob && c.status === 'completed');

  if (validClips.length === 0) {
    throw new Error('No successfully processed clips available for export.');
  }

  const manifestData: Array<{
    partNumber: number;
    filename: string;
    originalIndex: number;
    startTime: string;
    endTime: string;
    durationSeconds: number;
    sizeBytes: number;
    edits: {
      rotation: number;
      muted: boolean;
      cropped: boolean;
      hasTextOverlay: boolean;
    };
  }> = [];

  // Sequential numbering: Part-1, Part-2... WITHOUT GAPS
  validClips.forEach((clip, index) => {
    const partNumber = index + 1;
    const extension = clip.processedBlob?.type.includes('webm') ? 'webm' : 'mp4';
    const filename = `${cleanProjectName}-Part-${partNumber}.${extension}`;

    if (clip.processedBlob) {
      zip.file(filename, clip.processedBlob);
    }

    manifestData.push({
      partNumber,
      filename,
      originalIndex: clip.originalIndex,
      startTime: formatTimestamp(clip.startTime),
      endTime: formatTimestamp(clip.endTime),
      durationSeconds: parseFloat(clip.duration.toFixed(3)),
      sizeBytes: clip.processedBlob?.size || 0,
      edits: {
        rotation: clip.edits.rotation,
        muted: clip.edits.mute,
        cropped: !!clip.edits.crop,
        hasTextOverlay: !!clip.edits.textOverlay?.text
      }
    });
  });

  if (includeManifest) {
    const manifest = {
      project: cleanProjectName,
      exportedAt: new Date().toISOString(),
      sourceVideo: sourceMetadata
        ? {
            name: sourceMetadata.name,
            totalDuration: formatTimestamp(sourceMetadata.duration),
            resolution: `${sourceMetadata.width}x${sourceMetadata.height}`,
            format: sourceMetadata.format,
            sizeBytes: sourceMetadata.size
          }
        : null,
      totalExportedClips: validClips.length,
      clips: manifestData
    };

    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  }

  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 4 }
    },
    (metadata) => {
      if (onProgress) {
        onProgress(Math.round(metadata.percent));
      }
    }
  );

  const zipFilename = `${cleanProjectName}-Clips.zip`;
  return { zipBlob, zipFilename };
}

/**
 * Initiates browser download of a Blob file.
 */
export function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
