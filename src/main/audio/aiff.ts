import type { LoopMarker } from "../../shared/types.js";
import type { Chunk, DecodedAudio, ParsedAudio } from "./types.js";
import { validateAudioShape } from "./validation.js";
import { buildWaveformPeaks } from "./waveform.js";

interface AiffCommon {
  channels: number;
  frames: number;
  bitsPerSample: number;
  sampleRate: number;
}

interface Marker {
  id: number;
  position: number;
  name: string;
}

export function parseAiff(buffer: Buffer): ParsedAudio {
  const decoded = decodeAiff(buffer);
  return {
    format: "aiff",
    sampleRate: decoded.sampleRate,
    channels: decoded.channels,
    bitDepth: decoded.bitDepth,
    durationSamples: decoded.durationSamples,
    loop: decoded.loop,
    waveform: buildWaveformPeaks(decoded.pcm),
    validation: decoded.loop ? "AIFF loop metadata loaded." : "Ready."
  };
}

export function decodeAiff(buffer: Buffer): DecodedAudio {
  const chunks = readAiffChunks(buffer);
  const comm = chunks.find((chunk) => chunk.id === "COMM");
  const ssnd = chunks.find((chunk) => chunk.id === "SSND");
  if (!comm || !ssnd) {
    throw new Error("Invalid AIFF: missing COMM or SSND chunk.");
  }
  const common = parseCommon(buffer.subarray(comm.dataOffset, comm.dataOffset + comm.size));
  validateAudioShape("AIFF", common.channels, common.sampleRate, common.frames);
  const pcm = decodeAiffPcm(buffer.subarray(ssnd.dataOffset, ssnd.dataOffset + ssnd.size), common);
  const markers = parseMarkers(buffer, chunks);
  const loop = parseInstrumentLoop(buffer, chunks, markers);

  return {
    sampleRate: common.sampleRate,
    channels: common.channels,
    bitDepth: common.bitsPerSample,
    durationSamples: common.frames,
    pcm,
    loop
  };
}

export function writeAiffLoop(input: Buffer, loop: LoopMarker): Buffer {
  const chunks = readAiffChunks(input);
  const parts: Buffer[] = [];
  parts.push(Buffer.from("FORM"));
  parts.push(Buffer.alloc(4));
  parts.push(input.subarray(8, 12));

  for (const chunk of chunks) {
    if (chunk.id === "MARK" || chunk.id === "INST") {
      continue;
    }
    parts.push(input.subarray(chunk.offset, chunk.offset + chunk.totalSize));
  }

  parts.push(createMarkChunk(loop));
  parts.push(createInstChunk());
  const output = Buffer.concat(parts);
  output.writeUInt32BE(output.length - 8, 4);
  return output;
}

function readAiffChunks(buffer: Buffer): Chunk[] {
  if (buffer.toString("ascii", 0, 4) !== "FORM") {
    throw new Error("Invalid AIFF: missing FORM header.");
  }
  const formType = buffer.toString("ascii", 8, 12);
  if (formType !== "AIFF" && formType !== "AIFC") {
    throw new Error(`Unsupported AIFF form: ${formType}.`);
  }

  const chunks: Chunk[] = [];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32BE(offset + 4);
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

function parseCommon(data: Buffer): AiffCommon {
  if (data.length < 18) {
    throw new Error("Invalid AIFF: COMM chunk is too short.");
  }
  return {
    channels: data.readUInt16BE(0),
    frames: data.readUInt32BE(2),
    bitsPerSample: data.readUInt16BE(6),
    sampleRate: readExtended80(data.subarray(8, 18))
  };
}

function decodeAiffPcm(data: Buffer, common: AiffCommon): Float32Array[] {
  if (data.length < 8) {
    throw new Error("Invalid AIFF: SSND chunk is too short.");
  }
  const offset = data.readUInt32BE(0);
  if (8 + offset > data.length) {
    throw new Error("Invalid AIFF: SSND offset is outside the chunk.");
  }
  const soundData = data.subarray(8 + offset);
  const bytesPerSample = Math.ceil(common.bitsPerSample / 8);
  const blockAlign = bytesPerSample * common.channels;
  if (![8, 16, 24, 32].includes(common.bitsPerSample)) {
    throw new Error(`Unsupported AIFF bit depth: ${common.bitsPerSample}.`);
  }
  if (blockAlign < 1) {
    throw new Error("Invalid AIFF: block align is invalid.");
  }
  const frames = Math.min(common.frames, Math.floor(soundData.length / blockAlign));
  const channels = Array.from({ length: common.channels }, () => new Float32Array(frames));

  for (let frame = 0; frame < frames; frame += 1) {
    const frameOffset = frame * blockAlign;
    for (let channel = 0; channel < common.channels; channel += 1) {
      const sampleOffset = frameOffset + channel * bytesPerSample;
      channels[channel][frame] = readBigEndianPcm(soundData, sampleOffset, common.bitsPerSample);
    }
  }

  return channels;
}

function readBigEndianPcm(data: Buffer, offset: number, bits: number): number {
  if (bits === 8) {
    return data.readInt8(offset) / 128;
  }
  if (bits === 16) {
    return data.readInt16BE(offset) / 32768;
  }
  if (bits === 24) {
    return data.readIntBE(offset, 3) / 8388608;
  }
  if (bits === 32) {
    return data.readInt32BE(offset) / 2147483648;
  }
  throw new Error(`Unsupported AIFF bit depth: ${bits}.`);
}

function parseMarkers(buffer: Buffer, chunks: Chunk[]): Marker[] {
  const chunk = chunks.find((item) => item.id === "MARK");
  if (!chunk || chunk.size < 2) {
    return [];
  }
  const data = buffer.subarray(chunk.dataOffset, chunk.dataOffset + chunk.size);
  const count = data.readUInt16BE(0);
  const markers: Marker[] = [];
  let offset = 2;
  for (let i = 0; i < count && offset + 7 <= data.length; i += 1) {
    const id = data.readUInt16BE(offset);
    const position = data.readUInt32BE(offset + 2);
    const nameLength = data.readUInt8(offset + 6);
    const name = data.toString("ascii", offset + 7, offset + 7 + nameLength);
    markers.push({ id, position, name });
    offset += 7 + nameLength + ((nameLength + 1) % 2 === 1 ? 1 : 0);
  }
  return markers;
}

function parseInstrumentLoop(buffer: Buffer, chunks: Chunk[], markers: Marker[]): LoopMarker | null {
  const chunk = chunks.find((item) => item.id === "INST");
  if (!chunk || chunk.size < 20) {
    return null;
  }
  const data = buffer.subarray(chunk.dataOffset, chunk.dataOffset + chunk.size);
  const playMode = data.readUInt16BE(8);
  const beginMarker = data.readUInt16BE(10);
  const endMarker = data.readUInt16BE(12);
  if (playMode === 0 || beginMarker === 0 || endMarker === 0) {
    return null;
  }
  const start = markers.find((marker) => marker.id === beginMarker);
  const end = markers.find((marker) => marker.id === endMarker);
  if (!start || !end || end.position <= start.position) {
    return null;
  }
  return {
    startSample: start.position,
    endSample: end.position,
    lengthSamples: end.position - start.position,
    confidence: null,
    source: "metadata"
  };
}

function createMarkChunk(loop: LoopMarker): Buffer {
  const startName = Buffer.from("Loop Start", "ascii");
  const endName = Buffer.from("Loop End", "ascii");
  const startRecord = createMarkerRecord(1, loop.startSample, startName);
  const endRecord = createMarkerRecord(2, loop.endSample, endName);
  const data = Buffer.concat([uint16be(2), startRecord, endRecord]);
  const header = Buffer.alloc(8);
  header.write("MARK", 0, "ascii");
  header.writeUInt32BE(data.length, 4);
  return Buffer.concat([header, data, data.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]);
}

function createMarkerRecord(id: number, position: number, name: Buffer): Buffer {
  const fixed = Buffer.alloc(7);
  fixed.writeUInt16BE(id, 0);
  fixed.writeUInt32BE(position, 2);
  fixed.writeUInt8(name.length, 6);
  return Buffer.concat([fixed, name, (name.length + 1) % 2 ? Buffer.from([0]) : Buffer.alloc(0)]);
}

function createInstChunk(): Buffer {
  const data = Buffer.alloc(20);
  data.writeInt8(60, 0);
  data.writeInt8(0, 1);
  data.writeInt8(0, 2);
  data.writeInt8(127, 3);
  data.writeInt8(0, 4);
  data.writeInt8(127, 5);
  data.writeInt16BE(0, 6);
  data.writeUInt16BE(1, 8);
  data.writeUInt16BE(1, 10);
  data.writeUInt16BE(2, 12);
  data.writeUInt16BE(0, 14);
  data.writeUInt16BE(0, 16);
  data.writeUInt16BE(0, 18);
  const header = Buffer.alloc(8);
  header.write("INST", 0, "ascii");
  header.writeUInt32BE(data.length, 4);
  return Buffer.concat([header, data]);
}

function uint16be(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value, 0);
  return buffer;
}

function readExtended80(data: Buffer): number {
  const exponent = data.readUInt16BE(0);
  const sign = exponent & 0x8000 ? -1 : 1;
  const exp = (exponent & 0x7fff) - 16383;
  const hi = data.readUInt32BE(2);
  const lo = data.readUInt32BE(6);
  const mantissa = hi * 2 ** 32 + lo;
  if (exponent === 0 && mantissa === 0) {
    return 0;
  }
  return Math.round(sign * mantissa * 2 ** (exp - 63));
}

export const aiffInternals = { readAiffChunks, readExtended80 };
