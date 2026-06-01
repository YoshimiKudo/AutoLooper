import type { LoopMarker } from "../../shared/types.js";
import type { Chunk, DecodedAudio, ParsedAudio } from "./types.js";
import { maxAudioChannels, maxAudioSampleRate, validateAudioShape } from "./validation.js";
import { buildWaveformPeaks } from "./waveform.js";

interface WavFormat {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
}

export function parseWav(buffer: Buffer): ParsedAudio {
  const decoded = decodeWav(buffer);
  return {
    format: "wav",
    sampleRate: decoded.sampleRate,
    channels: decoded.channels,
    bitDepth: decoded.bitDepth,
    durationSamples: decoded.durationSamples,
    loop: decoded.loop,
    waveform: buildWaveformPeaks(decoded.pcm),
    validation: decoded.loop ? "WAV smpl loop metadata loaded." : "Ready."
  };
}

export function decodeWav(buffer: Buffer): DecodedAudio {
  const chunks = readRiffChunks(buffer);
  const fmtChunk = chunks.find((chunk) => chunk.id === "fmt ");
  const dataChunk = chunks.find((chunk) => chunk.id === "data");
  if (!fmtChunk || !dataChunk) {
    throw new Error("Invalid WAV: missing fmt or data chunk.");
  }

  const fmt = parseFmt(buffer.subarray(fmtChunk.dataOffset, fmtChunk.dataOffset + fmtChunk.size));
  const frames = Math.floor(dataChunk.size / fmt.blockAlign);
  validateAudioShape("WAV", fmt.channels, fmt.sampleRate, frames);
  const pcm = decodeWavPcm(buffer.subarray(dataChunk.dataOffset, dataChunk.dataOffset + dataChunk.size), fmt, frames);
  const smplChunk = chunks.find((chunk) => chunk.id === "smpl");
  const loop = smplChunk ? parseSmpl(buffer.subarray(smplChunk.dataOffset, smplChunk.dataOffset + smplChunk.size)) : null;

  return {
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    bitDepth: fmt.bitsPerSample,
    durationSamples: frames,
    pcm,
    loop
  };
}

export function writeWavLoop(input: Buffer, loop: LoopMarker): Buffer {
  const chunks = readRiffChunks(input);
  const smpl = createSmplChunk(loop);
  const parts: Buffer[] = [];
  parts.push(Buffer.from("RIFF"));
  parts.push(Buffer.alloc(4));
  parts.push(Buffer.from("WAVE"));

  for (const chunk of chunks) {
    if (chunk.id === "smpl") {
      continue;
    }
    parts.push(input.subarray(chunk.offset, chunk.offset + chunk.totalSize));
  }

  parts.push(smpl);
  const output = Buffer.concat(parts);
  output.writeUInt32LE(output.length - 8, 4);
  return output;
}

function readRiffChunks(buffer: Buffer): Chunk[] {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Invalid WAV: not a RIFF/WAVE file.");
  }

  const chunks: Chunk[] = [];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    const totalSize = 8 + size + (size % 2);
    if (dataOffset + size > buffer.length) {
      break;
    }
    chunks.push({ id, offset, dataOffset, size, totalSize });
    offset += totalSize;
  }
  return chunks;
}

function parseFmt(data: Buffer): WavFormat {
  if (data.length < 16) {
    throw new Error("Invalid WAV: fmt chunk is too short.");
  }
  const fmt = {
    audioFormat: data.readUInt16LE(0),
    channels: data.readUInt16LE(2),
    sampleRate: data.readUInt32LE(4),
    byteRate: data.readUInt32LE(8),
    blockAlign: data.readUInt16LE(12),
    bitsPerSample: data.readUInt16LE(14)
  };
  validateWavFormat(fmt);
  return fmt;
}

function decodeWavPcm(data: Buffer, fmt: WavFormat, frames: number): Float32Array[] {
  const channels = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
  const bytesPerSample = Math.ceil(fmt.bitsPerSample / 8);
  const isFloat = fmt.audioFormat === 3 && fmt.bitsPerSample === 32;
  const isPcm = fmt.audioFormat === 1;
  if (!isPcm && !isFloat) {
    throw new Error(`Unsupported WAV encoding: format ${fmt.audioFormat}.`);
  }

  for (let frame = 0; frame < frames; frame += 1) {
    const frameOffset = frame * fmt.blockAlign;
    for (let channel = 0; channel < fmt.channels; channel += 1) {
      const offset = frameOffset + channel * bytesPerSample;
      channels[channel][frame] = readPcmSample(data, offset, fmt.bitsPerSample, isFloat, false);
    }
  }

  return channels;
}

function validateWavFormat(fmt: WavFormat): void {
  const isFloat = fmt.audioFormat === 3 && fmt.bitsPerSample === 32;
  const isSupportedPcm = fmt.audioFormat === 1 && [8, 16, 24, 32].includes(fmt.bitsPerSample);
  if (!isSupportedPcm && !isFloat) {
    throw new Error(`Unsupported WAV encoding: format ${fmt.audioFormat}, ${fmt.bitsPerSample}-bit.`);
  }
  if (fmt.channels < 1 || fmt.channels > maxAudioChannels) {
    throw new Error(`Invalid WAV: channel count must be between 1 and ${maxAudioChannels}, got ${fmt.channels}.`);
  }
  if (fmt.sampleRate < 1 || fmt.sampleRate > maxAudioSampleRate) {
    throw new Error(`Invalid WAV: sample rate is out of range, got ${fmt.sampleRate}.`);
  }

  const bytesPerSample = Math.ceil(fmt.bitsPerSample / 8);
  const minimumBlockAlign = fmt.channels * bytesPerSample;
  if (fmt.blockAlign < minimumBlockAlign) {
    throw new Error(`Invalid WAV: block align ${fmt.blockAlign} is smaller than ${minimumBlockAlign}.`);
  }
}

function readPcmSample(data: Buffer, offset: number, bits: number, isFloat: boolean, bigEndian: boolean): number {
  if (isFloat) {
    return bigEndian ? data.readFloatBE(offset) : data.readFloatLE(offset);
  }
  if (bits === 8) {
    return (data.readUInt8(offset) - 128) / 128;
  }
  if (bits === 16) {
    return (bigEndian ? data.readInt16BE(offset) : data.readInt16LE(offset)) / 32768;
  }
  if (bits === 24) {
    const value = bigEndian
      ? data.readIntBE(offset, 3)
      : data.readIntLE(offset, 3);
    return value / 8388608;
  }
  if (bits === 32) {
    return (bigEndian ? data.readInt32BE(offset) : data.readInt32LE(offset)) / 2147483648;
  }
  throw new Error(`Unsupported PCM bit depth: ${bits}.`);
}

function parseSmpl(data: Buffer): LoopMarker | null {
  if (data.length < 60) {
    return null;
  }
  const loopCount = data.readUInt32LE(28);
  if (loopCount < 1) {
    return null;
  }
  const startSample = data.readUInt32LE(44);
  const endInclusive = data.readUInt32LE(48);
  const endSample = endInclusive + 1;
  return {
    startSample,
    endSample,
    lengthSamples: endSample - startSample,
    confidence: null,
    source: "metadata"
  };
}

function createSmplChunk(loop: LoopMarker): Buffer {
  const data = Buffer.alloc(60);
  data.writeUInt32LE(0, 0);
  data.writeUInt32LE(0, 4);
  data.writeUInt32LE(0, 8);
  data.writeUInt32LE(60, 12);
  data.writeUInt32LE(0, 16);
  data.writeUInt32LE(0, 20);
  data.writeUInt32LE(0, 24);
  data.writeUInt32LE(1, 28);
  data.writeUInt32LE(0, 32);
  data.writeUInt32LE(0, 36);
  data.writeUInt32LE(0, 40);
  data.writeUInt32LE(loop.startSample, 44);
  data.writeUInt32LE(Math.max(loop.startSample, loop.endSample - 1), 48);
  data.writeUInt32LE(0, 52);
  data.writeUInt32LE(0, 56);

  const header = Buffer.alloc(8);
  header.write("smpl", 0, "ascii");
  header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data]);
}

export const wavInternals = { readRiffChunks, parseSmpl };
