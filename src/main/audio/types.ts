import type { AudioFormat, LoopMarker, WaveformPeaks } from "../../shared/types.js";

export interface DecodedAudio {
  sampleRate: number;
  channels: number;
  bitDepth: number | null;
  durationSamples: number;
  pcm: Float32Array[];
  loop: LoopMarker | null;
}

export interface ParsedAudio {
  format: AudioFormat;
  sampleRate: number;
  channels: number;
  bitDepth: number | null;
  durationSamples: number;
  loop: LoopMarker | null;
  waveform: WaveformPeaks | null;
  validation: string;
}

export interface Chunk {
  id: string;
  offset: number;
  dataOffset: number;
  size: number;
  totalSize: number;
}
