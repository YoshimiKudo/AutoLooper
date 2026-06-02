import type { LoopMarker } from "../../shared/types.js";
import type { ParsedAudio } from "./types.js";
import { validateAudioShape } from "./validation.js";

interface FlacBlock {
  type: number;
  isLast: boolean;
  offset: number;
  dataOffset: number;
  length: number;
  totalEnd: number;
  data: Buffer;
}

interface CommentBlock {
  vendor: string;
  comments: string[];
}

const streamInfoBlockType = 0;
const vorbisCommentBlockType = 4;
const maxFlacMetadataBlockBytes = 16 * 1024 * 1024;
const maxVorbisComments = 10000;
const maxVorbisCommentBytes = 1024 * 1024;

export function parseFlac(buffer: Buffer): ParsedAudio {
  const blocks = readFlacMetadataBlocks(buffer);
  const streamInfo = blocks.find((block) => block.type === streamInfoBlockType);
  if (!streamInfo) {
    throw new Error("Invalid FLAC: missing STREAMINFO block.");
  }
  if (streamInfo.length < 34) {
    throw new Error("Invalid FLAC: STREAMINFO block is truncated.");
  }

  const packed = streamInfo.data.readBigUInt64BE(10);
  const sampleRate = Number((packed >> 44n) & 0xfffffn);
  const channels = Number((packed >> 41n) & 0x7n) + 1;
  const bitDepth = Number((packed >> 36n) & 0x1fn) + 1;
  const durationSamplesBig = packed & 0xfffffffffn;
  if (durationSamplesBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Invalid FLAC: sample count is too large.");
  }
  const durationSamples = Number(durationSamplesBig);
  validateAudioShape("FLAC", channels, sampleRate, durationSamples);

  const commentBlock = blocks.find((block) => block.type === vorbisCommentBlockType);
  const comments = commentBlock ? parseVorbisCommentBlock(commentBlock.data) : null;
  const loop = comments ? loopFromComments(comments.comments) : null;

  return {
    format: "flac",
    sampleRate,
    channels,
    bitDepth,
    durationSamples,
    loop,
    waveform: null,
    validation: loop ? "FLAC loop comments loaded." : "Ready. Waveform preview requires FLAC decode support."
  };
}

export function writeFlacLoop(input: Buffer, loop: LoopMarker): Buffer {
  const blocks = readFlacMetadataBlocks(input);
  const audioStart = blocks[blocks.length - 1]?.totalEnd;
  if (audioStart === undefined) {
    throw new Error("Invalid FLAC: missing metadata blocks.");
  }

  let updatedComment = false;
  const nextBlocks = blocks.map((block) => {
    if (block.type !== vorbisCommentBlockType) {
      return block;
    }
    updatedComment = true;
    const data = updateVorbisCommentBlock(block.data, loop);
    return {
      ...block,
      data,
      length: data.length
    };
  });

  if (!updatedComment) {
    nextBlocks.push({
      type: vorbisCommentBlockType,
      isLast: false,
      offset: 0,
      dataOffset: 0,
      length: 0,
      totalEnd: 0,
      data: buildVorbisCommentBlock("AutoLooper", loopCommentStrings([], loop))
    });
  }

  const metadata = nextBlocks.map((block, index) => createMetadataBlock(block.type, block.data, index === nextBlocks.length - 1));
  return Buffer.concat([Buffer.from("fLaC", "ascii"), ...metadata, input.subarray(audioStart)]);
}

function readFlacMetadataBlocks(buffer: Buffer): FlacBlock[] {
  if (buffer.length < 8 || buffer.toString("ascii", 0, 4) !== "fLaC") {
    throw new Error("Invalid FLAC: missing fLaC marker.");
  }

  const blocks: FlacBlock[] = [];
  let offset = 4;
  while (offset + 4 <= buffer.length) {
    const header = buffer.readUInt8(offset);
    const isLast = (header & 0x80) !== 0;
    const type = header & 0x7f;
    const length = buffer.readUIntBE(offset + 1, 3);
    if (length > maxFlacMetadataBlockBytes) {
      throw new Error(`Invalid FLAC: metadata block is too large (${length} bytes).`);
    }
    const dataOffset = offset + 4;
    const totalEnd = dataOffset + length;
    if (totalEnd > buffer.length) {
      throw new Error("Invalid FLAC: truncated metadata block.");
    }
    blocks.push({
      type,
      isLast,
      offset,
      dataOffset,
      length,
      totalEnd,
      data: buffer.subarray(dataOffset, totalEnd)
    });
    offset = totalEnd;
    if (isLast) {
      return blocks;
    }
  }
  throw new Error("Invalid FLAC: metadata blocks are not terminated.");
}

function parseVorbisCommentBlock(data: Buffer): CommentBlock {
  let offset = 0;
  requireCommentBytes(data, offset, 4, "vendor length");
  const vendorLength = data.readUInt32LE(offset);
  offset += 4;
  requireCommentBytes(data, offset, vendorLength, "vendor string");
  const vendor = data.toString("utf8", offset, offset + vendorLength);
  offset += vendorLength;
  requireCommentBytes(data, offset, 4, "comment count");
  const count = data.readUInt32LE(offset);
  if (count > maxVorbisComments) {
    throw new Error(`Invalid FLAC Vorbis comment block: too many comments (${count}).`);
  }
  offset += 4;

  const comments: string[] = [];
  for (let i = 0; i < count; i += 1) {
    requireCommentBytes(data, offset, 4, "comment length");
    const length = data.readUInt32LE(offset);
    if (length > maxVorbisCommentBytes) {
      throw new Error(`Invalid FLAC Vorbis comment block: comment is too large (${length} bytes).`);
    }
    offset += 4;
    requireCommentBytes(data, offset, length, "comment string");
    comments.push(data.toString("utf8", offset, offset + length));
    offset += length;
  }
  return { vendor, comments };
}

function updateVorbisCommentBlock(data: Buffer, loop: LoopMarker): Buffer {
  const current = parseVorbisCommentBlock(data);
  return buildVorbisCommentBlock(current.vendor, loopCommentStrings(current.comments, loop));
}

function buildVorbisCommentBlock(vendorText: string, comments: string[]): Buffer {
  const vendor = Buffer.from(vendorText, "utf8");
  const commentBuffers = comments.map((comment) => Buffer.from(comment, "utf8"));
  const parts: Buffer[] = [];
  const vendorLength = Buffer.alloc(4);
  vendorLength.writeUInt32LE(vendor.length, 0);
  parts.push(vendorLength, vendor);
  const count = Buffer.alloc(4);
  count.writeUInt32LE(commentBuffers.length, 0);
  parts.push(count);
  for (const comment of commentBuffers) {
    const length = Buffer.alloc(4);
    length.writeUInt32LE(comment.length, 0);
    parts.push(length, comment);
  }
  return Buffer.concat(parts);
}

function loopCommentStrings(comments: string[], loop: LoopMarker): string[] {
  const kept = comments.filter((comment) => {
    const key = comment.split("=", 1)[0]?.toUpperCase();
    return key !== "LOOPSTART" && key !== "LOOPEND" && key !== "LOOPLENGTH";
  });
  kept.push(`LOOPSTART=${loop.startSample}`);
  kept.push(`LOOPEND=${loop.endSample}`);
  kept.push(`LOOPLENGTH=${loop.lengthSamples}`);
  return kept;
}

function loopFromComments(comments: string[]): LoopMarker | null {
  const map = new Map<string, string>();
  for (const comment of comments) {
    const index = comment.indexOf("=");
    if (index > 0) {
      map.set(comment.slice(0, index).toUpperCase(), comment.slice(index + 1));
    }
  }
  const start = parseInteger(map.get("LOOPSTART"));
  const end = parseInteger(map.get("LOOPEND"));
  const length = parseInteger(map.get("LOOPLENGTH"));
  if (start === null) {
    return null;
  }
  const endSample = end ?? (length !== null ? start + length : null);
  if (endSample === null || endSample <= start) {
    return null;
  }
  return {
    startSample: start,
    endSample,
    lengthSamples: endSample - start,
    confidence: null,
    source: "metadata"
  };
}

function parseInteger(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value.replace(/[,_\s]/g, ""), 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function createMetadataBlock(type: number, data: Buffer, isLast: boolean): Buffer {
  if (data.length > 0xffffff) {
    throw new Error("FLAC metadata block is too large to write.");
  }
  const header = Buffer.alloc(4);
  header.writeUInt8((isLast ? 0x80 : 0) | (type & 0x7f), 0);
  header.writeUIntBE(data.length, 1, 3);
  return Buffer.concat([header, data]);
}

function requireCommentBytes(data: Buffer, offset: number, length: number, label: string): void {
  if (length < 0 || offset < 0 || offset + length > data.length) {
    throw new Error(`Invalid FLAC Vorbis comment block: truncated ${label}.`);
  }
}

export const flacInternals = { readFlacMetadataBlocks, parseVorbisCommentBlock };
