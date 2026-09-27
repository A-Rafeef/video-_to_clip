// Anonymous Cloud Uploader - Zero Login, Zero Setup, Multi-GB Support
// Uses GoFile (high-speed, unlimited size, full CORS) with automatic TmpFiles fallback

export interface AnonymousUploadResult {
  pageUrl: string;
  downloadUrl: string;
  filename: string;
  sizeBytes: number;
}

/**
 * Uploads a file directly to anonymous cloud storage without requiring any login, password, or OAuth.
 * Supports files up to several Gigabytes with real-time percentage progress.
 */
export async function uploadToAnonymousCloud({
  blob,
  filename,
  onProgress
}: {
  blob: Blob;
  filename: string;
  onProgress?: (percent: number, loadedBytes: number, totalBytes: number) => void;
}): Promise<AnonymousUploadResult> {
  const safeFilename = filename.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'ClipForge-Clips.zip';

  // Strategy 1: GoFile API (Best for large files > 50MB up to multi-GB, unlimited size, 100% CORS)
  try {
    return await uploadToGoFile({ blob, filename: safeFilename, onProgress });
  } catch (gofileErr) {
    console.warn('GoFile upload failed, attempting fallback to TmpFiles:', gofileErr);

    // Strategy 2: TmpFiles API (For smaller files under 80MB)
    if (blob.size < 80 * 1024 * 1024) {
      return await uploadToTmpFiles({ blob, filename: safeFilename, onProgress });
    }
    throw gofileErr;
  }
}

/**
 * GoFile API Upload (Handles 400MB+, 1GB+, 5GB+ with 100% CORS and fast speeds)
 */
async function uploadToGoFile({
  blob,
  filename,
  onProgress
}: {
  blob: Blob;
  filename: string;
  onProgress?: (percent: number, loadedBytes: number, totalBytes: number) => void;
}): Promise<AnonymousUploadResult> {
  // Step 1: Query best upload server
  let server = 'store8';
  try {
    const sRes = await fetch('https://api.gofile.io/servers', { method: 'GET' });
    if (sRes.ok) {
      const sData = await sRes.json();
      if (sData.status === 'ok' && sData.data?.servers?.length > 0) {
        server = sData.data.servers[0].name;
      }
    }
  } catch {
    server = 'store8';
  }

  // Step 2: Upload file via multipart stream with real-time progress
  const formData = new FormData();
  formData.append('file', blob, filename);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://${server}.gofile.io/contents/uploadfile`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        onProgress(percent, event.loaded, event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.status === 'ok' && res.data?.downloadPage) {
            resolve({
              pageUrl: res.data.downloadPage,
              downloadUrl: res.data.downloadPage,
              filename: res.data.name || filename,
              sizeBytes: blob.size
            });
          } else {
            reject(new Error(res.message || 'GoFile returned an unexpected response.'));
          }
        } catch {
          reject(new Error('Failed to parse GoFile response.'));
        }
      } else {
        reject(new Error(`GoFile upload failed with status ${xhr.status}.`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error while uploading to GoFile. Please check your internet connection.'));
    };

    xhr.send(formData);
  });
}

/**
 * TmpFiles API Upload (Fallback)
 */
async function uploadToTmpFiles({
  blob,
  filename,
  onProgress
}: {
  blob: Blob;
  filename: string;
  onProgress?: (percent: number, loadedBytes: number, totalBytes: number) => void;
}): Promise<AnonymousUploadResult> {
  const formData = new FormData();
  formData.append('file', blob, filename);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://tmpfiles.org/api/v1/upload');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        onProgress(percent, event.loaded, event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.status === 'success' && res.data?.url) {
            const pageUrl: string = res.data.url;
            const downloadUrl = pageUrl.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
            resolve({
              pageUrl,
              downloadUrl,
              filename,
              sizeBytes: blob.size
            });
          } else {
            reject(new Error(res.message || 'TmpFiles returned an invalid response.'));
          }
        } catch {
          reject(new Error('Failed to parse TmpFiles response.'));
        }
      } else {
        reject(new Error(`TmpFiles upload failed with status ${xhr.status}.`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error while uploading to TmpFiles.'));
    };

    xhr.send(formData);
  });
}
