// Google Drive Upload Utility using Google Identity Services (GIS) & Drive API v3

export const DEFAULT_GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) ||
  '730295812346-vi4lqlf87qp85o97r1j54o0u10ivugfh.apps.googleusercontent.com';

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token?: string;
              error?: string;
              error_description?: string;
            }) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

/**
 * Ensures Google Identity Services (GIS) script is loaded in the browser.
 */
export async function loadGsiScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
    return;
  }

  return new Promise((resolve, reject) => {
    const existing = document.getElementById('google-gsi-client');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', (e) => reject(new Error('Failed to load Google GIS client')));
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-gsi-client';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google GIS library. Please check your internet connection.'));
    document.head.appendChild(script);
  });
}

/**
 * Requests OAuth2 Access Token for Google Drive file scope using Google's pop-up prompt.
 */
export async function requestGoogleAccessToken(
  clientId: string = DEFAULT_GOOGLE_CLIENT_ID
): Promise<string> {
  await loadGsiScript();

  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services client is not available.');
  }

  return new Promise((resolve, reject) => {
    try {
      const tokenClient = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_FILE_SCOPE,
        callback: (resp) => {
          if (resp.error) {
            reject(new Error(resp.error_description || resp.error || 'Google authentication was cancelled.'));
            return;
          }
          if (resp.access_token) {
            resolve(resp.access_token);
          } else {
            reject(new Error('Failed to acquire Google access token.'));
          }
        }
      });

      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (err) {
      reject(err);
    }
  });
}

export interface GoogleDriveUploadResult {
  fileId: string;
  driveUrl: string;
  name: string;
  sizeBytes: number;
}

/**
 * Uploads a file Blob directly to Google Drive using Google Drive API v3 Resumable Upload.
 * Supports large ZIP archives with real-time percentage progress.
 */
export async function uploadBlobToGoogleDrive({
  accessToken,
  blob,
  filename,
  mimeType = 'application/zip',
  onProgress
}: {
  accessToken: string;
  blob: Blob;
  filename: string;
  mimeType?: string;
  onProgress?: (percent: number, loadedBytes: number, totalBytes: number) => void;
}): Promise<GoogleDriveUploadResult> {
  // Step 1: Initialize Resumable Session with Google Drive API
  const metadata = {
    name: filename,
    mimeType: mimeType,
    description: 'Exported & packaged with ClipForge Video Editor'
  };

  const initResponse = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': blob.size.toString()
      },
      body: JSON.stringify(metadata)
    }
  );

  if (!initResponse.ok) {
    const errorText = await initResponse.text();
    throw new Error(
      `Google Drive initialization failed (${initResponse.status}): ${errorText}`
    );
  }

  const uploadUrl = initResponse.headers.get('Location');
  if (!uploadUrl) {
    throw new Error('Google Drive did not return a valid upload location URL.');
  }

  // Step 2: Upload the raw binary stream with real-time progress via XMLHttpRequest
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', mimeType);

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
          const fileId = res.id;
          const driveUrl = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
          resolve({
            fileId,
            driveUrl,
            name: res.name || filename,
            sizeBytes: blob.size
          });
        } catch (parseErr) {
          reject(new Error('Failed to parse Google Drive response JSON.'));
        }
      } else {
        reject(
          new Error(`Google Drive upload failed with status ${xhr.status}: ${xhr.responseText}`)
        );
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error occurred while uploading to Google Drive.'));
    };

    xhr.send(blob);
  });
}
