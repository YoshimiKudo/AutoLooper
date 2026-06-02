export type AudioFormat = "wav" | "aiff" | "ogg" | "mp3" | "flac" | "opus";

export type DetectionMode = "normal" | "deep";

export type TrackStatus =
  | "pending"
  | "processing"
  | "detected"
  | "low-confidence"
  | "no-loop"
  | "edited"
  | "warning"
  | "canceled"
  | "saved"
  | "error";

export interface DetectionSettings {
  mode: DetectionMode;
  matchWindowMs: number;
  matchThreshold: number;
  minimumLoopMs: number;
  loopCheckPrerollMs: number;
}

export interface LoopMarker {
  startSample: number;
  endSample: number;
  lengthSamples: number;
  confidence: number | null;
  source: "metadata" | "detected" | "manual";
}

export interface WaveformPeaks {
  resolution: number;
  channels: Array<{
    min: number[];
    max: number[];
  }>;
}

export interface TrackInfo {
  id: string;
  filePath: string;
  fileName: string;
  outputPath: string;
  format: AudioFormat;
  sampleRate: number;
  bitDepth: number | null;
  channels: number;
  durationSamples: number;
  durationMs: number;
  loop: LoopMarker | null;
  status: TrackStatus;
  validation: string;
  waveform: WaveformPeaks | null;
}

export interface DetectionResult {
  id: string;
  loop: LoopMarker | null;
  status: TrackStatus;
  validation: string;
}

export interface SaveResult {
  id: string;
  outputPath: string;
  status: TrackStatus;
  validation: string;
}

export interface SaveOptions {
  outputDirectory: string | null;
  filenameSuffix: string;
}

export interface ImportResult {
  tracks: TrackInfo[];
  errors: string[];
}

export interface DroppedFileRef {
  name: string;
  path: string;
}
