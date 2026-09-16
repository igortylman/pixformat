export type OutputFormat = 'jpeg' | 'png' | 'webp' | 'bmp';

export interface QueuedFile {
  id: string;
  file: File;
  animated: boolean;
}

export interface ConvertRequestMsg {
  id: string;
  fileData: ArrayBuffer;
  sourceMimeType: string;
  targetFormat: OutputFormat;
  quality: number;
}

export type ConvertResultMsg =
  | { id: string; success: true; blob: Blob }
  | { id: string; success: false; error: string };
