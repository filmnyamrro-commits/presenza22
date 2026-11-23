import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import type {
  FeedbackAttachmentCategory,
  FeedbackAttachmentMeta,
  FeedbackAttachmentMimeType,
} from '../types';
import { generateSafeId } from './dateTime';
import { compressImageFile } from './imageCompress';

export const FEEDBACK_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB for PDF / MP4 / MOV
export const FEEDBACK_JPEG_RAW_MAX_BYTES = 25 * 1024 * 1024; // Compressed before upload
export const FEEDBACK_ATTACHMENT_CHUNK_CHARS = 280_000;
export const FEEDBACK_ATTACHMENT_MAX_CHUNKS = 24;

export interface PreparedFeedbackAttachment {
  meta: FeedbackAttachmentMeta;
  chunks: string[];
  previewUrl: string;
}

export function formatAttachmentBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function resolveFeedbackAttachmentFormat(file: File): {
  mimeType: FeedbackAttachmentMimeType;
  fileCategory: FeedbackAttachmentCategory;
} | null {
  const rawType = (file.type || '').toLowerCase().trim();
  const name = (file.name || '').toLowerCase().trim();

  if (rawType === 'application/pdf' || /\.pdf$/i.test(name)) {
    return { mimeType: 'application/pdf', fileCategory: 'pdf' };
  }
  if (
    rawType === 'image/jpeg' ||
    rawType === 'image/jpg' ||
    /\.jpe?g$/i.test(name)
  ) {
    return { mimeType: 'image/jpeg', fileCategory: 'image' };
  }
  if (rawType === 'video/mp4' || /\.mp4$/i.test(name)) {
    return { mimeType: 'video/mp4', fileCategory: 'video' };
  }
  if (rawType === 'video/quicktime' || /\.mov$/i.test(name)) {
    return { mimeType: 'video/quicktime', fileCategory: 'video' };
  }
  return null;
}

function readFileAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Failed to read selected file.'));
        return;
      }
      const commaIdx = reader.result.indexOf(',');
      if (commaIdx === -1) {
        reject(new Error('Invalid encoded file payload.'));
        return;
      }
      resolve(reader.result.slice(commaIdx + 1));
    };
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

function estimateBase64ByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(1, Math.floor((base64.length * 3) / 4) - padding);
}

function splitBase64IntoChunks(base64: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += FEEDBACK_ATTACHMENT_CHUNK_CHARS) {
    chunks.push(base64.slice(i, i + FEEDBACK_ATTACHMENT_CHUNK_CHARS));
  }
  return chunks;
}

export async function prepareFeedbackAttachment(
  file: File
): Promise<PreparedFeedbackAttachment> {
  const detected = resolveFeedbackAttachmentFormat(file);
  if (!detected) {
    throw new Error(
      'Unsupported file format. Please choose a PDF (.pdf), JPEG photo (.jpg / .jpeg), or video (.mp4 / .mov).'
    );
  }

  const safeName =
    (file.name || 'attachment')
      .replace(/[^\w.\- ()]+/g, '_')
      .trim()
      .slice(0, 180) || 'attachment';

  if (detected.fileCategory === 'image') {
    if (file.size > FEEDBACK_JPEG_RAW_MAX_BYTES) {
      throw new Error(
        'Selected JPEG photo exceeds 25 MB. Please choose a smaller image.'
      );
    }
    const compressedDataUrl = await compressImageFile(file);
    const commaIdx = compressedDataUrl.indexOf(',');
    const base64 =
      commaIdx >= 0 ? compressedDataUrl.slice(commaIdx + 1) : compressedDataUrl;
    const chunks = splitBase64IntoChunks(base64);
    if (chunks.length === 0 || chunks.length > FEEDBACK_ATTACHMENT_MAX_CHUNKS) {
      throw new Error('Compressed photo exceeded maximum storage size.');
    }
    const byteSize = estimateBase64ByteLength(base64);
    return {
      meta: {
        attachmentId: generateSafeId('attdoc'),
        fileName: safeName,
        mimeType: 'image/jpeg',
        fileCategory: 'image',
        byteSize,
        chunkCount: chunks.length,
      },
      chunks,
      previewUrl: compressedDataUrl,
    };
  }

  if (file.size <= 0) {
    throw new Error('Selected file appears to be empty.');
  }
  if (file.size > FEEDBACK_ATTACHMENT_MAX_BYTES) {
    throw new Error(
      `File "${safeName}" is ${formatAttachmentBytes(
        file.size
      )}. Maximum allowed size for PDF and video (MP4 / MOV) is 5.00 MB.`
    );
  }

  const base64 = await readFileAsBase64(file);
  const chunks = splitBase64IntoChunks(base64);
  if (chunks.length === 0 || chunks.length > FEEDBACK_ATTACHMENT_MAX_CHUNKS) {
    throw new Error(
      'Selected document or video is too large to attach. Please keep files at or under 5 MB.'
    );
  }

  const previewUrl = URL.createObjectURL(file);
  return {
    meta: {
      attachmentId: generateSafeId('attdoc'),
      fileName: safeName,
      mimeType: detected.mimeType,
      fileCategory: detected.fileCategory,
      byteSize: file.size,
      chunkCount: chunks.length,
    },
    chunks,
    previewUrl,
  };
}

export async function uploadFeedbackAttachment(
  params: {
    submissionId: string;
    eventId: string;
    prepared: PreparedFeedbackAttachment;
    onProgress?: (percent: number) => void;
  }
): Promise<void> {
  const { submissionId, eventId, prepared, onProgress } = params;
  const { meta, chunks } = prepared;

  await setDoc(doc(db, 'feedbackAttachments', meta.attachmentId), {
    submissionId,
    eventId,
    fileName: meta.fileName,
    mimeType: meta.mimeType,
    fileCategory: meta.fileCategory,
    byteSize: meta.byteSize,
    chunkCount: meta.chunkCount,
    createdAt: serverTimestamp(),
  });

  const totalSteps = chunks.length;
  for (let idx = 0; idx < chunks.length; idx++) {
    const chunkId = `chunk_${idx}`;
    await setDoc(
      doc(db, 'feedbackAttachments', meta.attachmentId, 'chunks', chunkId),
      {
        submissionId,
        eventId,
        chunkIndex: idx,
        data: chunks[idx],
        createdAt: serverTimestamp(),
      }
    );
    if (onProgress) {
      onProgress(Math.round(((idx + 1) / totalSteps) * 100));
    }
  }
}

export async function fetchFeedbackAttachmentBlobUrl(
  meta: FeedbackAttachmentMeta
): Promise<{ blobUrl: string; revoke: () => void }> {
  const chunksSnap = await getDocs(
    query(
      collection(db, 'feedbackAttachments', meta.attachmentId, 'chunks'),
      orderBy('chunkIndex', 'asc')
    )
  );

  if (chunksSnap.empty) {
    throw new Error('Attachment data could not be found or was deleted.');
  }

  const parts: string[] = [];
  chunksSnap.forEach((docSnap) => {
    const data = docSnap.data() as { data?: string };
    if (typeof data.data === 'string') {
      parts.push(data.data);
    }
  });

  const fullBase64 = parts.join('');
  const binaryString = window.atob(fullBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const blob = new Blob([bytes], { type: meta.mimeType });
  const blobUrl = URL.createObjectURL(blob);
  return {
    blobUrl,
    revoke: () => URL.revokeObjectURL(blobUrl),
  };
}

export async function deleteFeedbackAttachmentRecord(
  attachmentId: string
): Promise<void> {
  if (!attachmentId) return;
  try {
    const chunksSnap = await getDocs(
      collection(db, 'feedbackAttachments', attachmentId, 'chunks')
    );
    await Promise.all(chunksSnap.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(doc(db, 'feedbackAttachments', attachmentId));
  } catch {
    // Best-effort cleanup if attachment was never uploaded or already removed
  }
}
