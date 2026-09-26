import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { SourceVideoPanel } from './components/SourceVideoPanel';
import { ClipWorkspacePanel } from './components/ClipWorkspacePanel';
import { ExportPanel } from './components/ExportPanel';
import { VideoEditorModal } from './components/VideoEditorModal';
import { QuickPreviewModal } from './components/QuickPreviewModal';
import { ExportModal, type ZipResult } from './components/ExportModal';
import type {
  VideoMetadata,
  SplitStrategyType,
  ClipItem,
  CompressionProfile,
  ExportProgress
} from './types/video';
import { MAX_CLIP_DURATION_SECONDS, parseTimestamp } from './utils/time';
import { generateThumbnail, createInstantThumbnail, generateThumbnailsInPool } from './utils/thumbnail';
import { processClip, type EncodingEngine, clearParsedMP4Cache } from './utils/videoProcessor';
import { packageClipsToZip, triggerFileDownload } from './utils/zipPackager';
import { saveProjectState, loadProjectState } from './utils/storage';
import { DEFAULT_PLAYER_OVERLAY } from './utils/playerOverlay';

export const App: React.FC = () => {
  const [projectName, setProjectName] = useState<string>('My Video Project');
  const [sourceMetadata, setSourceMetadata] = useState<VideoMetadata | null>(null);
  const [splitStrategy, setSplitStrategy] = useState<SplitStrategyType>('90s');
  const [customDuration, setCustomDuration] = useState<number>(60);
  const [globalPlayerOverlayEnabled, setGlobalPlayerOverlayEnabled] = useState<boolean>(false);
  const [globalPlayerOverlayDuration, setGlobalPlayerOverlayDuration] = useState<number>(1.5);
  const [exportConcurrency, setExportConcurrency] = useState<number>(4);
  const [encodingEngine, setEncodingEngine] = useState<EncodingEngine>('lossless');
  const [manualTimestampsText, setManualTimestampsText] = useState<string>(
    '00:00.000 - 01:23.500\n01:23.500 - 02:40.000'
  );

  const [clips, setClips] = useState<ClipItem[]>([]);
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // Modals
  const [activeEditorClip, setActiveEditorClip] = useState<ClipItem | null>(null);
  const [activePreviewClip, setActivePreviewClip] = useState<ClipItem | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isExportModalMinimized, setIsExportModalMinimized] = useState<boolean>(false);
  const [zipResult, setZipResult] = useState<ZipResult | null>(null);

  // Export & Compression
  const [compressionProfile, setCompressionProfile] = useState<CompressionProfile>('balanced');
  const [includeManifest, setIncludeManifest] = useState<boolean>(true);
  const [exportProgress, setExportProgress] = useState<ExportProgress>({
    isExporting: false,
    currentClipIndex: 0,
    totalClips: 0,
    overallProgress: 0,
    currentClipProgress: 0,
    startTime: 0,
    elapsedSeconds: 0,
    estimatedRemainingSec: 0,
    isZipping: false,
    zipProgress: 0,
    isCancelled: false
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  // Warn before unload if exporting
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (exportProgress.isExporting) {
        e.preventDefault();
        e.returnValue = 'Export is currently in progress. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [exportProgress.isExporting]);

  // Restore project state on initial load
  useEffect(() => {
    loadProjectState<{
      projectName: string;
      splitStrategy: SplitStrategyType;
      customDuration: number;
    }>().then((saved) => {
      if (saved) {
        if (saved.projectName) setProjectName(saved.projectName);
        if (saved.splitStrategy) setSplitStrategy(saved.splitStrategy);
        if (saved.customDuration) setCustomDuration(saved.customDuration);
      }
    });
  }, []);

  // Persist project settings
  useEffect(() => {
    saveProjectState({
      projectName,
      splitStrategy,
      customDuration
    });
  }, [projectName, splitStrategy, customDuration]);

  // Video loaded handler
  const handleVideoLoaded = (meta: VideoMetadata) => {
    clearParsedMP4Cache();
    setSourceMetadata(meta);
    // Derive sensible default project name from filename
    const cleanName = meta.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
    setProjectName(cleanName);
    setClips([]);
    setSelectedClipIds(new Set());
  };

  // Reset project
  const handleResetProject = () => {
    clearParsedMP4Cache();
    if (sourceMetadata?.url) {
      URL.revokeObjectURL(sourceMetadata.url);
    }
    setSourceMetadata(null);
    setClips([]);
    setSelectedClipIds(new Set());
    setProjectName('My Video Project');
    setExportProgress({
      isExporting: false,
      currentClipIndex: 0,
      totalClips: 0,
      overallProgress: 0,
      currentClipProgress: 0,
      startTime: 0,
      elapsedSeconds: 0,
      estimatedRemainingSec: 0,
      isZipping: false,
      zipProgress: 0,
      isCancelled: false
    });
  };

  // Generate clips based on split strategy
  const handleGenerateClips = async () => {
    if (!sourceMetadata) return;
    setIsGenerating(true);

    const totalDuration = sourceMetadata.duration;
    const segments: Array<{ start: number; end: number }> = [];

    if (splitStrategy === 'manual') {
      const lines = manualTimestampsText.split('\n').filter((l) => l.trim().length > 0);
      lines.forEach((line) => {
        const parts = line.split('-').map((p) => p.trim());
        if (parts.length === 2) {
          const s = parseTimestamp(parts[0]);
          const e = parseTimestamp(parts[1]);
          if (s !== null && e !== null && e > s) {
            // Strictly enforce MAX 90 seconds
            const duration = Math.min(MAX_CLIP_DURATION_SECONDS, e - s);
            segments.push({
              start: Math.max(0, s),
              end: Math.min(totalDuration, s + duration)
            });
          }
        }
      });
    } else {
      let interval = 90.0;
      if (splitStrategy === '60s') interval = 60.0;
      else if (splitStrategy === '30s') interval = 30.0;
      else if (splitStrategy === 'custom') interval = Math.min(MAX_CLIP_DURATION_SECONDS, Math.max(5.0, customDuration));

      let cursor = 0;
      while (cursor < totalDuration) {
        const end = Math.min(totalDuration, cursor + interval);
        segments.push({ start: cursor, end });
        cursor = end;
      }
    }

    if (segments.length === 0) {
      alert('No valid clip segments could be generated with the given parameters.');
      setIsGenerating(false);
      return;
    }

    const newClips: ClipItem[] = [];
    const newSelectedIds = new Set<string>();

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const clipId = `clip_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`;
      const duration = seg.end - seg.start;

      // Instant placeholder thumbnail (0ms wait time!)
      const instantThumb = createInstantThumbnail(i, duration);

      const initialEdits = {
        startTime: seg.start,
        endTime: seg.end,
        crop: null,
        rotation: 0 as const,
        mute: false,
        textOverlay: null,
        playerOverlay: {
          ...DEFAULT_PLAYER_OVERLAY,
          enabled: globalPlayerOverlayEnabled,
          durationSec: globalPlayerOverlayDuration
        }
      };

      const clipItem: ClipItem = {
        id: clipId,
        originalIndex: i,
        startTime: seg.start,
        endTime: seg.end,
        duration: Math.min(MAX_CLIP_DURATION_SECONDS, duration),
        thumbnail: instantThumb,
        status: 'waiting',
        progress: 0,
        edits: initialEdits,
        history: [initialEdits],
        historyIndex: 0
      };

      newClips.push(clipItem);
      newSelectedIds.add(clipId);
    }

    // Instantly display all clips in UI with 0ms delay!
    setClips(newClips);
    setSelectedClipIds(newSelectedIds);
    setIsGenerating(false);

    // Rapidly populate real video frame thumbnails in background using single pooled video player
    const clipInfos = newClips.map((c) => ({ id: c.id, timeSec: c.startTime + 0.1 }));
    generateThumbnailsInPool(sourceMetadata.url, clipInfos, (clipId, dataUrl) => {
      setClips((prev) => prev.map((c) => (c.id === clipId ? { ...c, thumbnail: dataUrl } : c)));
    }).catch(() => {});
  };

  // Select / Deselect
  const toggleSelectClip = (id: string) => {
    setSelectedClipIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedClipIds(new Set(clips.map((c) => c.id)));
  };

  const handleDeselectAll = () => {
    setSelectedClipIds(new Set());
  };

  // Delete clip
  const handleDeleteClip = (id: string) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
    setSelectedClipIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // Batch delete
  const handleBatchDelete = () => {
    if (selectedClipIds.size === 0) return;
    if (window.confirm(`Delete ${selectedClipIds.size} selected clip(s)?`)) {
      setClips((prev) => prev.filter((c) => !selectedClipIds.has(c.id)));
      setSelectedClipIds(new Set());
    }
  };

  // Batch mute
  const handleBatchMuteToggle = () => {
    setClips((prev) =>
      prev.map((clip) => {
        if (!selectedClipIds.has(clip.id)) return clip;
        const newMute = !clip.edits.mute;
        const newEdits = { ...clip.edits, mute: newMute };
        return {
          ...clip,
          edits: newEdits,
          status: 'waiting',
          processedBlob: undefined
        };
      })
    );
  };

  // Batch rotate
  const handleBatchRotate = () => {
    setClips((prev) =>
      prev.map((clip) => {
        if (!selectedClipIds.has(clip.id)) return clip;
        const nextRot = ((clip.edits.rotation + 90) % 360) as 0 | 90 | 180 | 270;
        const newEdits = { ...clip.edits, rotation: nextRot };
        return {
          ...clip,
          edits: newEdits,
          status: 'waiting',
          processedBlob: undefined
        };
      })
    );
  };

  // Batch crop
  const handleBatchCropRatio = (preset: '16:9' | '9:16' | '1:1') => {
    if (!sourceMetadata) return;
    const srcW = sourceMetadata.width || 1280;
    const srcH = sourceMetadata.height || 720;
    let ratio = 9 / 16;
    if (preset === '16:9') ratio = 16 / 9;
    if (preset === '1:1') ratio = 1;

    let cropW = srcW;
    let cropH = srcW / ratio;
    if (cropH > srcH) {
      cropH = srcH;
      cropW = srcH * ratio;
    }

    const x = Math.round((srcW - cropW) / 2);
    const y = Math.round((srcH - cropH) / 2);

    setClips((prev) =>
      prev.map((clip) => {
        if (!selectedClipIds.has(clip.id)) return clip;
        const newEdits = {
          ...clip.edits,
          crop: { x, y, width: Math.round(cropW), height: Math.round(cropH), aspectRatio: preset }
        };
        return {
          ...clip,
          edits: newEdits,
          status: 'waiting',
          processedBlob: undefined
        };
      })
    );
  };

  // Batch text watermark
  const handleBatchTextOverlay = (text: string) => {
    setClips((prev) =>
      prev.map((clip) => {
        if (!selectedClipIds.has(clip.id)) return clip;
        const newEdits = {
          ...clip.edits,
          textOverlay: {
            text,
            position: 'bottom' as const,
            fontSize: 24,
            color: '#FFFFFF',
            bgColor: 'rgba(0, 0, 0, 0.7)',
            showBg: true
          }
        };
        return {
          ...clip,
          edits: newEdits,
          status: 'waiting',
          processedBlob: undefined
        };
      })
    );
  };

  // Batch toggle player overlay on selected clips
  const handleBatchPlayerOverlayToggle = () => {
    const selected = clips.filter((c) => selectedClipIds.has(c.id));
    const allEnabled = selected.every((c) => c.edits.playerOverlay?.enabled !== false);
    const targetState = !allEnabled;

    setClips((prev) =>
      prev.map((clip) => {
        if (!selectedClipIds.has(clip.id)) return clip;
        const currentOverlay = clip.edits.playerOverlay || DEFAULT_PLAYER_OVERLAY;
        return {
          ...clip,
          edits: {
            ...clip.edits,
            playerOverlay: {
              ...currentOverlay,
              enabled: targetState
            }
          },
          status: 'waiting',
          processedBlob: undefined
        };
      })
    );
  };

  // Global toggle for all clips from ExportPanel
  const handleToggleGlobalPlayerOverlay = (enabled: boolean) => {
    setGlobalPlayerOverlayEnabled(enabled);
    if (enabled && encodingEngine === 'lossless') {
      setEncodingEngine('webcodecs');
    }
    setClips((prev) =>
      prev.map((clip) => {
        const currentOverlay = clip.edits.playerOverlay || DEFAULT_PLAYER_OVERLAY;
        return {
          ...clip,
          edits: {
            ...clip.edits,
            playerOverlay: {
              ...currentOverlay,
              enabled
            }
          },
          status: 'waiting',
          processedBlob: undefined
        };
      })
    );
  };

  // Global duration adjustment from ExportPanel
  const handleChangeGlobalPlayerOverlayDuration = (durationSec: number) => {
    setGlobalPlayerOverlayDuration(durationSec);
    setClips((prev) =>
      prev.map((clip) => {
        const currentOverlay = clip.edits.playerOverlay || DEFAULT_PLAYER_OVERLAY;
        return {
          ...clip,
          edits: {
            ...clip.edits,
            playerOverlay: {
              ...currentOverlay,
              durationSec
            }
          },
          status: 'waiting',
          processedBlob: undefined
        };
      })
    );
  };

  // Engine change handler - disables player overlay when switching to lossless
  const handleEncodingEngineChange = (engine: EncodingEngine) => {
    setEncodingEngine(engine);
    if (engine === 'lossless') {
      setGlobalPlayerOverlayEnabled(false);
      setClips((prev) =>
        prev.map((clip) => ({
          ...clip,
          edits: {
            ...clip.edits,
            playerOverlay: {
              ...(clip.edits.playerOverlay || DEFAULT_PLAYER_OVERLAY),
              enabled: false
            }
          }
        }))
      );
    }
  };

  // Reorder clips (HTML5 drag & drop or buttons)
  const handleReorderClip = (fromIndex: number, toIndex: number) => {
    setClips((prev) => {
      const list = [...prev];
      const [moved] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, moved);
      return list;
    });
  };

  // Save clip updates from modal editor
  const handleSaveClipEdits = (updatedClip: ClipItem) => {
    setClips((prev) => prev.map((c) => (c.id === updatedClip.id ? updatedClip : c)));
  };

  // Split / Cut clip into two subclips
  const handleSplitClip = async (clipId: string, splitAtSec: number) => {
    if (!sourceMetadata) return;
    const clipIndex = clips.findIndex((c) => c.id === clipId);
    if (clipIndex === -1) return;

    const original = clips[clipIndex];
    const durationA = splitAtSec - original.startTime;
    const durationB = original.endTime - splitAtSec;

    const thumbA = original.thumbnail;
    const thumbB = await generateThumbnail(sourceMetadata.url, splitAtSec + 0.1);

    const clipA: ClipItem = {
      ...original,
      id: `clip_${Date.now()}_a`,
      endTime: splitAtSec,
      duration: Math.min(MAX_CLIP_DURATION_SECONDS, durationA),
      thumbnail: thumbA,
      status: 'waiting',
      processedBlob: undefined
    };

    const clipB: ClipItem = {
      ...original,
      id: `clip_${Date.now()}_b`,
      startTime: splitAtSec,
      duration: Math.min(MAX_CLIP_DURATION_SECONDS, durationB),
      thumbnail: thumbB,
      status: 'waiting',
      processedBlob: undefined
    };

    setClips((prev) => {
      const list = [...prev];
      list.splice(clipIndex, 1, clipA, clipB);
      return list;
    });

    setSelectedClipIds((prev) => {
      const next = new Set(prev);
      next.delete(clipId);
      next.add(clipA.id);
      next.add(clipB.id);
      return next;
    });
  };

  // Retry processing single failed clip
  const handleRetryClip = async (clip: ClipItem) => {
    if (!sourceMetadata) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setClips((prev) =>
      prev.map((c) => (c.id === clip.id ? { ...c, status: 'processing', progress: 0, error: undefined } : c))
    );

    try {
      const result = await processClip({
        sourceUrl: sourceMetadata.url,
        sourceFile: sourceMetadata.file,
        clip,
        profile: compressionProfile,
        engine: encodingEngine,
        signal: controller.signal,
        onProgress: (p) => {
          setClips((prev) =>
            prev.map((c) => (c.id === clip.id ? { ...c, progress: Math.round(p) } : c))
          );
        }
      });

      setClips((prev) =>
        prev.map((c) =>
          c.id === clip.id
            ? {
                ...c,
                status: 'completed',
                progress: 100,
                processedBlob: result.blob,
                actualSizeBytes: result.blob.size
              }
            : c
        )
      );
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setClips((prev) =>
        prev.map((c) =>
          c.id === clip.id ? { ...c, status: 'failed', error: (err as Error).message } : c
        )
      );
    }
  };

  // Start Batch Export & Compression
  const handleStartExport = async () => {
    if (!sourceMetadata) return;
    const selectedList = clips.filter((c) => selectedClipIds.has(c.id));
    if (selectedList.length === 0) return;

    setZipResult(null);
    setIsExportModalOpen(true);
    setIsExportModalMinimized(false);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const startTime = Date.now();
    setExportProgress({
      isExporting: true,
      currentClipIndex: 0,
      totalClips: selectedList.length,
      overallProgress: 0,
      currentClipProgress: 0,
      startTime,
      elapsedSeconds: 0,
      estimatedRemainingSec: Math.round(selectedList.length * 15),
      isZipping: false,
      zipProgress: 0,
      isCancelled: false
    });

    const elapsedTimer = setInterval(() => {
      setExportProgress((prev) => {
        if (!prev.isExporting) return prev;
        const elapsed = Math.round((Date.now() - prev.startTime) / 1000);
        return { ...prev, elapsedSeconds: elapsed };
      });
    }, 1000);

    try {
      const concurrency = Math.min(Math.max(1, exportConcurrency), selectedList.length);
      let nextClipIndex = 0;
      const progressMap = new Map<string, number>();

      const runWorker = async () => {
        while (nextClipIndex < selectedList.length && !controller.signal.aborted) {
          const index = nextClipIndex++;
          const currentClip = selectedList[index];

          setClips((prev) =>
            prev.map((c) =>
              c.id === currentClip.id ? { ...c, status: 'processing', progress: 0 } : c
            )
          );

          try {
            const result = await processClip({
              sourceUrl: sourceMetadata.url,
              sourceFile: sourceMetadata.file,
              clip: currentClip,
              profile: compressionProfile,
              engine: encodingEngine,
              signal: controller.signal,
              onProgress: (p) => {
                progressMap.set(currentClip.id, p);

                // Calculate weighted progress across all selected clips
                let totalAccumulated = 0;
                for (const clip of selectedList) {
                  totalAccumulated += progressMap.get(clip.id) || 0;
                }
                const totalProgress = (totalAccumulated / (selectedList.length * 100)) * 100;
                const elapsed = (Date.now() - startTime) / 1000;
                const estimatedTotal = totalProgress > 0 ? elapsed / (totalProgress / 100) : 60;
                const remaining = Math.max(0, Math.round(estimatedTotal - elapsed));

                setExportProgress((prev) => ({
                  ...prev,
                  currentClipIndex: index,
                  currentClipProgress: p,
                  overallProgress: Math.min(99, Math.round(totalProgress)),
                  estimatedRemainingSec: remaining
                }));

                setClips((prev) =>
                  prev.map((c) => (c.id === currentClip.id ? { ...c, progress: Math.round(p) } : c))
                );
              }
            });

            progressMap.set(currentClip.id, 100);

            // Mark current clip completed
            setClips((prev) =>
              prev.map((c) =>
                c.id === currentClip.id
                  ? {
                      ...c,
                      status: 'completed',
                      progress: 100,
                      processedBlob: result.blob,
                      actualSizeBytes: result.blob.size
                    }
                  : c
              )
            );
          } catch (clipErr: unknown) {
            if (clipErr instanceof DOMException && clipErr.name === 'AbortError') {
              break;
            }
            console.error(`Clip processing error on #${index + 1}:`, clipErr);
            setClips((prev) =>
              prev.map((c) =>
                c.id === currentClip.id
                  ? { ...c, status: 'failed', error: (clipErr as Error).message }
                  : c
              )
            );
          }
        }
      };

      // Run parallel encoder workers
      const workers = Array.from({ length: concurrency }, () => runWorker());
      await Promise.all(workers);

      // If not aborted, trigger packaging ZIP automatically
      if (!controller.signal.aborted) {
        setExportProgress((prev) => ({
          ...prev,
          isZipping: true,
          zipProgress: 0,
          overallProgress: 100
        }));

        // Read latest state of clips
        setClips((latestClips) => {
          packageClipsToZip({
            projectName,
            clips: latestClips.filter((c) => selectedClipIds.has(c.id)),
            sourceMetadata,
            includeManifest,
            onProgress: (p) => {
              setExportProgress((prev) => ({ ...prev, zipProgress: p }));
            }
          })
            .then(({ zipBlob, zipFilename }) => {
              const res: ZipResult = {
                blob: zipBlob,
                filename: zipFilename,
                size: zipBlob.size
              };
              setZipResult(res);
              setIsExportModalOpen(true);
              setIsExportModalMinimized(false);
              triggerFileDownload(zipBlob, zipFilename);
            })
            .catch((zipErr) => {
              alert(`ZIP Creation failed: ${zipErr.message}`);
            })
            .finally(() => {
              setExportProgress((prev) => ({
                ...prev,
                isExporting: false,
                isZipping: false
              }));
              clearInterval(elapsedTimer);
            });

          return latestClips;
        });
      }
    } catch (err: unknown) {
      console.error('Batch export fatal error:', err);
    } finally {
      clearInterval(elapsedTimer);
      setExportProgress((prev) => ({ ...prev, isExporting: false }));
    }
  };

  // Cancel running export
  const handleCancelExport = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setExportProgress((prev) => ({ ...prev, isExporting: false, isCancelled: true }));
  };

  // Manual trigger download ZIP for already completed clips
  const handleDownloadZip = async () => {
    const selectedCompleted = clips.filter(
      (c) => selectedClipIds.has(c.id) && c.status === 'completed' && c.processedBlob
    );

    if (selectedCompleted.length === 0) {
      alert('No processed clips are ready to download yet.');
      return;
    }

    if (zipResult) {
      setIsExportModalOpen(true);
      setIsExportModalMinimized(false);
      return;
    }

    try {
      setIsExportModalOpen(true);
      setIsExportModalMinimized(false);
      setExportProgress((prev) => ({
        ...prev,
        isExporting: true,
        isZipping: true,
        zipProgress: 0,
        totalClips: selectedCompleted.length
      }));

      const { zipBlob, zipFilename } = await packageClipsToZip({
        projectName,
        clips: selectedCompleted,
        sourceMetadata,
        includeManifest,
        onProgress: (p) => {
          setExportProgress((prev) => ({ ...prev, zipProgress: p }));
        }
      });
      const res: ZipResult = {
        blob: zipBlob,
        filename: zipFilename,
        size: zipBlob.size
      };
      setZipResult(res);
      triggerFileDownload(zipBlob, zipFilename);
    } catch (err: unknown) {
      alert(`Download failed: ${(err as Error).message}`);
    } finally {
      setExportProgress((prev) => ({ ...prev, isExporting: false, isZipping: false }));
    }
  };

  return (
    <div className="app-container">
      <Header
        projectName={projectName}
        onProjectNameChange={setProjectName}
        onResetProject={handleResetProject}
      />

      <main className="main-workspace">
        {/* 1. Source Video Panel */}
        <SourceVideoPanel
          videoMetadata={sourceMetadata}
          onVideoLoaded={handleVideoLoaded}
          splitStrategy={splitStrategy}
          onSplitStrategyChange={setSplitStrategy}
          customDuration={customDuration}
          onCustomDurationChange={setCustomDuration}
          manualTimestampsText={manualTimestampsText}
          onManualTimestampsChange={setManualTimestampsText}
          onGenerateClips={handleGenerateClips}
          isGenerating={isGenerating}
          totalClipsCount={clips.length}
        />

        {/* 2. Clip Workspace Panel */}
        <ClipWorkspacePanel
          clips={clips}
          selectedClipIds={selectedClipIds}
          onToggleSelectClip={toggleSelectClip}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onOpenEditor={(clip) => setActiveEditorClip(clip)}
          onQuickPreview={(clip) => setActivePreviewClip(clip)}
          onDeleteClip={handleDeleteClip}
          onBatchDelete={handleBatchDelete}
          onBatchMuteToggle={handleBatchMuteToggle}
          onBatchRotate={handleBatchRotate}
          onBatchCropRatio={handleBatchCropRatio}
          onBatchTextOverlay={handleBatchTextOverlay}
          onBatchPlayerOverlayToggle={handleBatchPlayerOverlayToggle}
          onReorderClip={handleReorderClip}
          onRetryClip={handleRetryClip}
          sourceMetadata={sourceMetadata}
        />

        {/* 3. Export & ZIP Panel */}
        <ExportPanel
          projectName={projectName}
          clips={clips}
          selectedClipIds={selectedClipIds}
          compressionProfile={compressionProfile}
          onProfileChange={setCompressionProfile}
          exportProgress={exportProgress}
          onStartExport={handleStartExport}
          onCancelExport={handleCancelExport}
          onDownloadZip={handleDownloadZip}
          includeManifest={includeManifest}
          onToggleManifest={setIncludeManifest}
          sourceMetadata={sourceMetadata}
          globalPlayerOverlayEnabled={globalPlayerOverlayEnabled}
          onToggleGlobalPlayerOverlay={handleToggleGlobalPlayerOverlay}
          globalPlayerOverlayDuration={globalPlayerOverlayDuration}
          onChangeGlobalPlayerOverlayDuration={handleChangeGlobalPlayerOverlayDuration}
          exportConcurrency={exportConcurrency}
          onConcurrencyChange={setExportConcurrency}
          encodingEngine={encodingEngine}
          onEncodingEngineChange={handleEncodingEngineChange}
        />
      </main>

      {/* Frame-Accurate Video Editor Modal */}
      {activeEditorClip && sourceMetadata && (
        <VideoEditorModal
          clip={activeEditorClip}
          sourceMetadata={sourceMetadata}
          isOpen={!!activeEditorClip}
          onClose={() => setActiveEditorClip(null)}
          onSave={handleSaveClipEdits}
          onSplitClip={handleSplitClip}
        />
      )}

      {/* Quick Preview Modal */}
      {activePreviewClip && sourceMetadata && (
        <QuickPreviewModal
          clip={activePreviewClip}
          sourceMetadata={sourceMetadata}
          isOpen={!!activePreviewClip}
          onClose={() => setActivePreviewClip(null)}
        />
      )}

      {/* Export Progress & Download Pop-Up Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        isMinimized={isExportModalMinimized}
        onClose={() => setIsExportModalOpen(false)}
        onMinimize={() => setIsExportModalMinimized(true)}
        onRestore={() => setIsExportModalMinimized(false)}
        exportProgress={exportProgress}
        onCancelExport={handleCancelExport}
        clips={clips}
        selectedClipIds={selectedClipIds}
        sourceMetadata={sourceMetadata}
        projectName={projectName}
        encodingEngine={encodingEngine}
        zipResult={zipResult}
        onQuickPreview={(clip) => setActivePreviewClip(clip)}
      />
    </div>
  );
};
