import React, { useEffect, useState } from 'react';
import { Film, ShieldCheck, HardDrive, AlertTriangle, RotateCcw } from 'lucide-react';
import { checkStorageQuota, clearProjectStorage } from '../utils/storage';
import { formatFileSize } from '../utils/time';
import type { StorageEstimateInfo } from '../types/video';

interface HeaderProps {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onResetProject: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  projectName,
  onProjectNameChange,
  onResetProject
}) => {
  const [storageInfo, setStorageInfo] = useState<StorageEstimateInfo | null>(null);

  useEffect(() => {
    checkStorageQuota().then(setStorageInfo);
    const interval = setInterval(() => {
      checkStorageQuota().then(setStorageInfo);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleReset = async () => {
    if (window.confirm('Reset this project and clear temporary files from browser cache?')) {
      await clearProjectStorage();
      onResetProject();
    }
  };

  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-icon-box">
          <Film size={22} color="#ffffff" />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="brand-title">ClipForge Desktop</span>
            <span className="brand-badge">Client Pro</span>
          </div>
        </div>
      </div>

      <div className="header-project-name">
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
          Project:
        </span>
        <input
          type="text"
          className="header-project-input"
          value={projectName}
          onChange={(e) => onProjectNameChange(e.target.value)}
          placeholder="My Video Project"
          title="Project Name (used for Part-1, Part-2 exported filenames)"
        />
      </div>

      <div className="header-actions">
        <div className="privacy-pill" title="All video splitting and compression runs strictly inside your local browser. No video is uploaded to external servers.">
          <ShieldCheck size={14} />
          <span>100% Local Processing</span>
        </div>

        {storageInfo && (
          <div
            className={`storage-pill ${storageInfo.isLow ? 'warning' : ''}`}
            title={`Used: ${formatFileSize(storageInfo.usage)} / Total: ${formatFileSize(storageInfo.quota)}. Available: ${formatFileSize(storageInfo.available)}`}
          >
            {storageInfo.isLow ? <AlertTriangle size={14} /> : <HardDrive size={14} />}
            <span>
              {formatFileSize(storageInfo.available)} Free
            </span>
          </div>
        )}

        <button
          onClick={handleReset}
          className="toolbar-btn danger"
          title="Reset project and clean storage cache"
        >
          <RotateCcw size={14} />
          <span>Reset</span>
        </button>
      </div>
    </header>
  );
};
