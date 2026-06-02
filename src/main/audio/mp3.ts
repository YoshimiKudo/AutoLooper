import type { ParsedAudio } from "./types.js";
import { validateAudioShape } from "./validation.js";

interface Mp3FrameHeader {
  sampleRate: number;
  channels: number;
  frameLength: number;
  samplesPerFrame: number;
}

interface Mp3Scan {
  sampleRate: number;
  channels: number;
  durationSamples: number;
  frameCount: number;
}

const mpeg1Layer3Bitrates = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0
];
const mpeg2Layer3Bitrates = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0
];
const baseSampleRates = [44100, 48000, 32000];

export function parseMp3(buffer: Buffer): ParsedAudio {
  const scan = scanMp3Frames(buffer);
  validateAudioShape("MP3", scan.channels, scan.sampleRate, scan.durationSamples);
  return {
    format: "mp3",
    sampleRate: scan.sampleRate,
    channels: scan.channels,
    bitDepth: null,
    durationSamples: scan.durationSamples,
    loop: null,
    waveform: null,
    validation: "Ready. Waveform preview uses browser MP3 decode support."
  };
}

function scanMp3Frames(buffer: Buffer): Mp3Scan {
  let offset = skipId3v2(buffer);
  let sampleRate = 0;
  let channels = 0;
  let durationSamples = 0;
  let frameCount = 0;

  while (offset + 4 <= buffer.length) {
    const frame = parseFrameHeader(buffer, offset);
    if (!frame || offset + frame.frameLength > buffer.length) {
      offset += 1;
      continue;
    }

    if (frameCount === 0) {
      if (!looksLikeFrameSequence(buffer, offset, frame)) {
        offset += 1;
        continue;
      }
      sampleRate = frame.sampleRate;
      channels = frame.channels;
    } else if (frame.sampleRate !== sampleRate) {
      offset += 1;
      continue;
    }

    durationSamples += frame.samplesPerFrame;
    frameCount += 1;
    offset += frame.frameLength;
  }

  if (frameCount === 0) {
    throw new Error("Unsupported MP3: no MPEG Layer III frames found.");
  }

  return { sampleRate, channels, durationSamples, frameCount };
}

function skipId3v2(buffer: Buffer): number {
  if (buffer.length < 3 || buffer.toString("ascii", 0, 3) !== "ID3") {
    return 0;
  }
  if (buffer.length < 10) {
    throw new Error("Invalid MP3: truncated ID3v2 header.");
  }
  const sizeBytes = [buffer[6], buffer[7], buffer[8], buffer[9]];
  if (sizeBytes.some((value) => value > 0x7f)) {
    throw new Error("Invalid MP3: ID3v2 size is not syncsafe.");
  }
  const tagSize = sizeBytes.reduce((size, value) => (size << 7) | value, 0);
  const footerSize = (buffer[5] & 0x10) !== 0 ? 10 : 0;
  const totalSize = 10 + tagSize + footerSize;
  if (totalSize > buffer.length) {
    throw new Error("Invalid MP3: ID3v2 tag exceeds file size.");
  }
  return totalSize;
}

function looksLikeFrameSequence(buffer: Buffer, offset: number, frame: Mp3FrameHeader): boolean {
  const nextOffset = offset + frame.frameLength;
  if (nextOffset + 4 > buffer.length) {
    return true;
  }
  const nextFrame = parseFrameHeader(buffer, nextOffset);
  return Boolean(nextFrame && nextFrame.sampleRate === frame.sampleRate);
}

function parseFrameHeader(buffer: Buffer, offset: number): Mp3FrameHeader | null {
  const byte1 = buffer[offset + 1];
  const byte2 = buffer[offset + 2];
  const byte3 = buffer[offset + 3];
  if (buffer[offset] !== 0xff || (byte1 & 0xe0) !== 0xe0) {
    return null;
  }

  const versionBits = (byte1 >> 3) & 0x03;
  const layerBits = (byte1 >> 1) & 0x03;
  if (versionBits === 1 || layerBits !== 1) {
    return null;
  }

  const bitrateIndex = (byte2 >> 4) & 0x0f;
  const sampleRateIndex = (byte2 >> 2) & 0x03;
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
    return null;
  }

  const isMpeg1 = versionBits === 3;
  const bitrateKbps = (isMpeg1 ? mpeg1Layer3Bitrates : mpeg2Layer3Bitrates)[bitrateIndex];
  const sampleRate = sampleRateForVersion(versionBits, sampleRateIndex);
  if (!bitrateKbps || !sampleRate) {
    return null;
  }

  const padding = (byte2 >> 1) & 0x01;
  const frameLength = Math.floor(((isMpeg1 ? 144000 : 72000) * bitrateKbps) / sampleRate) + padding;
  if (frameLength < 24) {
    return null;
  }

  return {
    sampleRate,
    channels: (byte3 >> 6) === 3 ? 1 : 2,
    frameLength,
    samplesPerFrame: isMpeg1 ? 1152 : 576
  };
}

function sampleRateForVersion(versionBits: number, sampleRateIndex: number): number {
  const base = baseSampleRates[sampleRateIndex];
  if (versionBits === 3) return base;
  if (versionBits === 2) return base / 2;
  return base / 4;
}

export const mp3Internals = { parseFrameHeader, scanMp3Frames, skipId3v2 };
