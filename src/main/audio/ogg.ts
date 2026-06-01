import type { LoopMarker } from "../../shared/types.js";
import type { ParsedAudio } from "./types.js";
import { validateAudioShape } from "./validation.js";

interface OggPage {
  offset: number;
  headerType: number;
  granule: bigint;
  serial: number;
  sequence: number;
  segments: number[];
  dataOffset: number;
  dataEnd: number;
  totalEnd: number;
}

interface VorbisComments {
  vendor: string;
  comments: string[];
  packet: Buffer;
}

const maxVorbisComments = 10000;
const maxVorbisCommentBytes = 1024 * 1024;

export function parseOggVorbis(buffer: Buffer): ParsedAudio {
  const pages = readOggPages(buffer);
  const packets = extractPackets(buffer, pages, 3);
  if (packets.length < 2 || packets[0].toString("ascii", 1, 7) !== "vorbis") {
    throw new Error("Unsupported Ogg: only Vorbis streams are supported.");
  }

  const identification = packets[0];
  if (identification[0] !== 1 || identification.length < 30) {
    throw new Error("Invalid Ogg Vorbis identification header.");
  }

  const channels = identification.readUInt8(11);
  const sampleRate = identification.readUInt32LE(12);
  const comments = parseVorbisCommentPacket(packets[1]);
  const loop = loopFromComments(comments.comments);
  const durationSamples = Number(lastGranulePosition(pages));
  validateAudioShape("Ogg Vorbis", channels, sampleRate, durationSamples);

  return {
    format: "ogg",
    sampleRate,
    channels,
    bitDepth: null,
    durationSamples,
    loop,
    waveform: null,
    validation: loop ? "Ogg Vorbis loop comments loaded." : "Ready. Waveform preview requires Vorbis decode support."
  };
}

export function writeOggVorbisLoop(input: Buffer, loop: LoopMarker): Buffer {
  const pages = readOggPages(input);
  const extraction = extractHeaderPackets(input, pages);
  const updatedCommentPacket = updateVorbisCommentPacket(extraction.comment.packet, loop);

  const lastHeaderPage = pages[extraction.headerPageCount - 1];
  if (!lastHeaderPage || extraction.setupPacketEnd !== lastHeaderPage.dataEnd) {
    throw new Error("Unsupported Ogg layout: audio packets share the setup header page.");
  }

  const headerPackets = [extraction.identification, updatedCommentPacket, extraction.setup];
  const rebuiltHeader = paginateHeaderPackets(headerPackets, pages[0].serial);
  const remainingPages = renumberPages(input, pages.slice(extraction.headerPageCount), pages[0].serial, rebuiltHeader.nextSequence);
  return Buffer.concat([...rebuiltHeader.pages, ...remainingPages]);
}

function readOggPages(buffer: Buffer): OggPage[] {
  const pages: OggPage[] = [];
  let offset = 0;
  while (offset + 27 <= buffer.length) {
    if (buffer.toString("ascii", offset, offset + 4) !== "OggS") {
      throw new Error("Invalid Ogg: missing capture pattern.");
    }
    const segmentCount = buffer.readUInt8(offset + 26);
    const segmentTableOffset = offset + 27;
    const dataOffset = segmentTableOffset + segmentCount;
    if (dataOffset > buffer.length) {
      throw new Error("Invalid Ogg: truncated segment table.");
    }
    const segments = Array.from(buffer.subarray(segmentTableOffset, dataOffset));
    const dataSize = segments.reduce((sum, value) => sum + value, 0);
    const dataEnd = dataOffset + dataSize;
    if (dataEnd > buffer.length) {
      throw new Error("Invalid Ogg: truncated page data.");
    }
    pages.push({
      offset,
      headerType: buffer.readUInt8(offset + 5),
      granule: buffer.readBigUInt64LE(offset + 6),
      serial: buffer.readUInt32LE(offset + 14),
      sequence: buffer.readUInt32LE(offset + 18),
      segments,
      dataOffset,
      dataEnd,
      totalEnd: dataEnd
    });
    offset = dataEnd;
  }
  return pages;
}

function extractPackets(buffer: Buffer, pages: OggPage[], maxPackets: number): Buffer[] {
  const packets: Buffer[] = [];
  let current: Buffer[] = [];
  for (const page of pages) {
    let dataOffset = page.dataOffset;
    for (const segmentSize of page.segments) {
      current.push(buffer.subarray(dataOffset, dataOffset + segmentSize));
      dataOffset += segmentSize;
      if (segmentSize < 255) {
        packets.push(Buffer.concat(current));
        current = [];
        if (packets.length >= maxPackets) {
          return packets;
        }
      }
    }
  }
  return packets;
}

function extractHeaderPackets(buffer: Buffer, pages: OggPage[]) {
  const packetBuffers: Buffer[] = [];
  const packetRanges: Array<{ start: number; end: number; pageIndex: number }> = [];
  let current: Buffer[] = [];
  let packetStart = -1;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    let dataOffset = page.dataOffset;
    for (const segmentSize of page.segments) {
      if (packetStart < 0) {
        packetStart = dataOffset;
      }
      current.push(buffer.subarray(dataOffset, dataOffset + segmentSize));
      dataOffset += segmentSize;
      if (segmentSize < 255) {
        const packet = Buffer.concat(current);
        packetBuffers.push(packet);
        packetRanges.push({ start: packetStart, end: dataOffset, pageIndex });
        current = [];
        packetStart = -1;
        if (packetBuffers.length === 3) {
          const comment = parseVorbisCommentPacket(packetBuffers[1]);
          return {
            identification: packetBuffers[0],
            comment,
            setup: packetBuffers[2],
            commentPacketStart: packetRanges[1].start,
            commentPacketEnd: packetRanges[1].end,
            setupPacketEnd: packetRanges[2].end,
            headerPageCount: pageIndex + 1
          };
        }
      }
    }
  }
  throw new Error("Invalid Ogg Vorbis: missing header packets.");
}

function parseVorbisCommentPacket(packet: Buffer): VorbisComments {
  if (packet[0] !== 3 || packet.toString("ascii", 1, 7) !== "vorbis") {
    throw new Error("Invalid Vorbis comment header.");
  }
  let offset = 7;
  requirePacketBytes(packet, offset, 4, "vendor length");
  const vendorLength = packet.readUInt32LE(offset);
  offset += 4;
  requirePacketBytes(packet, offset, vendorLength, "vendor string");
  const vendor = packet.toString("utf8", offset, offset + vendorLength);
  offset += vendorLength;
  requirePacketBytes(packet, offset, 4, "comment count");
  const count = packet.readUInt32LE(offset);
  if (count > maxVorbisComments) {
    throw new Error(`Invalid Vorbis comment header: too many comments (${count}).`);
  }
  offset += 4;
  const comments: string[] = [];
  for (let i = 0; i < count && offset + 4 <= packet.length; i += 1) {
    const length = packet.readUInt32LE(offset);
    if (length > maxVorbisCommentBytes) {
      throw new Error(`Invalid Vorbis comment header: comment is too large (${length} bytes).`);
    }
    offset += 4;
    requirePacketBytes(packet, offset, length, "comment string");
    comments.push(packet.toString("utf8", offset, offset + length));
    offset += length;
  }
  return { vendor, comments, packet };
}

function requirePacketBytes(packet: Buffer, offset: number, length: number, label: string): void {
  if (length < 0 || offset < 0 || offset + length > packet.length) {
    throw new Error(`Invalid Vorbis comment header: truncated ${label}.`);
  }
}

function updateVorbisCommentPacket(packet: Buffer, loop: LoopMarker): Buffer {
  const current = parseVorbisCommentPacket(packet);
  const kept = current.comments.filter((comment) => {
    const key = comment.split("=", 1)[0]?.toUpperCase();
    return key !== "LOOPSTART" && key !== "LOOPEND" && key !== "LOOPLENGTH";
  });
  kept.push(`LOOPSTART=${loop.startSample}`);
  kept.push(`LOOPEND=${loop.endSample}`);
  kept.push(`LOOPLENGTH=${loop.lengthSamples}`);

  const vendor = Buffer.from(current.vendor, "utf8");
  const commentBuffers = kept.map((comment) => Buffer.from(comment, "utf8"));
  const parts: Buffer[] = [Buffer.from([3]), Buffer.from("vorbis")];
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
  parts.push(Buffer.from([1]));
  return Buffer.concat(parts);
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
  return Number.isFinite(parsed) ? parsed : null;
}

function lastGranulePosition(pages: OggPage[]): bigint {
  for (let i = pages.length - 1; i >= 0; i -= 1) {
    const granule = pages[i].granule;
    if (granule !== BigInt("0xffffffffffffffff")) {
      return granule;
    }
  }
  return 0n;
}

function rewritePageCrcs(buffer: Buffer, pages: OggPage[]): void {
  for (const page of pages) {
    buffer.writeUInt32LE(0, page.offset + 22);
    buffer.writeUInt32LE(oggCrc(buffer.subarray(page.offset, page.totalEnd)), page.offset + 22);
  }
}

function paginateHeaderPackets(packets: Buffer[], serial: number): { pages: Buffer[]; nextSequence: number } {
  const pages: Buffer[] = [];
  let sequence = 0;
  for (let packetIndex = 0; packetIndex < packets.length; packetIndex += 1) {
    const packet = packets[packetIndex];
    const lacing = packetToSegments(packet);
    let byteOffset = 0;
    let segmentOffset = 0;
    let firstFragment = true;
    while (segmentOffset < lacing.length) {
      const pageSegments = lacing.slice(segmentOffset, segmentOffset + 255);
      const pageDataLength = pageSegments.reduce((sum, value) => sum + value, 0);
      const pageData = packet.subarray(byteOffset, byteOffset + pageDataLength);
      let headerType = 0;
      if (packetIndex === 0 && firstFragment) headerType |= 0x02;
      if (!firstFragment) headerType |= 0x01;
      pages.push(createOggPage({
        headerType,
        granule: 0n,
        serial,
        sequence,
        segments: pageSegments,
        data: pageData
      }));
      sequence += 1;
      segmentOffset += pageSegments.length;
      byteOffset += pageDataLength;
      firstFragment = false;
    }
  }
  return { pages, nextSequence: sequence };
}

function packetToSegments(packet: Buffer): number[] {
  const segments: number[] = [];
  let remaining = packet.length;
  while (remaining >= 255) {
    segments.push(255);
    remaining -= 255;
  }
  segments.push(remaining);
  return segments;
}

function createOggPage(options: {
  headerType: number;
  granule: bigint;
  serial: number;
  sequence: number;
  segments: number[];
  data: Buffer;
}): Buffer {
  const header = Buffer.alloc(27 + options.segments.length);
  header.write("OggS", 0, "ascii");
  header.writeUInt8(0, 4);
  header.writeUInt8(options.headerType, 5);
  header.writeBigUInt64LE(options.granule, 6);
  header.writeUInt32LE(options.serial, 14);
  header.writeUInt32LE(options.sequence, 18);
  header.writeUInt32LE(0, 22);
  header.writeUInt8(options.segments.length, 26);
  Buffer.from(options.segments).copy(header, 27);
  const page = Buffer.concat([header, options.data]);
  page.writeUInt32LE(oggCrc(page), 22);
  return page;
}

function renumberPages(input: Buffer, pages: OggPage[], serial: number, startSequence: number): Buffer[] {
  return pages.map((page, index) => {
    const copy = Buffer.from(input.subarray(page.offset, page.totalEnd));
    copy.writeUInt32LE(serial, 14);
    copy.writeUInt32LE(startSequence + index, 18);
    copy.writeUInt32LE(0, 22);
    copy.writeUInt32LE(oggCrc(copy), 22);
    return copy;
  });
}

function oggCrc(data: Buffer): number {
  let crc = 0;
  for (const byte of data) {
    crc = ((crc << 8) ^ crcLookup[((crc >>> 24) & 0xff) ^ byte]) >>> 0;
  }
  return crc >>> 0;
}

const crcLookup = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let r = i << 24;
    for (let j = 0; j < 8; j += 1) {
      r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
    }
    table[i] = r >>> 0;
  }
  return table;
})();

export const oggInternals = { readOggPages, parseVorbisCommentPacket, updateVorbisCommentPacket, oggCrc };
