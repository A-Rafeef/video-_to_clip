// Anonymous Cloud Uploader (TmpFiles API) - Zero Login, Zero Setup, Up to 10GB

export interface AnonymousUploadResult {
  pageUrl: string;
  downloadUrl: string;
  filename: string;
  sizeBytes: number;
}

/**
 * Uploads a file directly to TmpFiles without requiring any login, password, or OAuth.
 * Supports up to 10GB with real-time percentage progress.
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
            // Standard direct download link uses /dl/ prefix
            const downloadUrl = pageUrl.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
            resolve({
              pageUrl,
              downloadUrl,
              filename,
              sizeBytes: blob.size
            });
          } else {
            reject(new Error(res.message || 'Upload failed with an unexpected server response.'));
          }
        } catch {
          reject(new Error('Failed to parse cloud upload response.'));
        }
      } else {
        reject(new Error(`Cloud upload failed with status ${xhr.status}.`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error while uploading to cloud. Please check your connection.'));
    };

    xhr.send(formData);
  });
}
