import { describe, expect, it } from "vitest";
import type { DetectionSettings, LoopMarker, TrackInfo } from "../src/shared/types";
import { findBestLoopDeep, measureMatch } from "../src/shared/detectCore";
import { parseFlac, writeFlacLoop } from "../src/main/audio/flac";
import { parseMp3 } from "../src/main/audio/mp3";
import { parseOggOpus, writeOggOpusLoop } from "../src/main/audio/ogg";
import { makeLoopedOutputPath, saveLoopedCopy } from "../src/main/services/files";
import { parseWav, writeWavLoop } from "../src/main/audio/wav";

describe("WAV loop metadata", () => {
  it("converts WAV smpl inclusive end to internal exclusive end", () => {
    const wav = createTestWav(48000, 2, 16, 1000, {
      startSample: 100,
      endSample: 501,
      lengthSamples: 401,
      confidence: null,
      source: "metadata"
    });

    const parsed = parseWav(wav);

    expect(parsed.loop?.startSample).toBe(100);
    expect(parsed.loop?.endSample).toBe(501);
    expect(parsed.loop?.lengthSamples).toBe(401);
  });

  it("round-trips internal exclusive end through WAV smpl inclusive end", () => {
    const wav = createTestWav(44100, 1, 16, 2000, null);
    const loop: LoopMarker = {
      startSample: 250,
      endSample: 1250,
      lengthSamples: 1000,
      confidence: 98.5,
      source: "detected"
    };

    const output = writeWavLoop(wav, loop);
    const parsed = parseWav(output);

    expect(parsed.loop?.startSample).toBe(250);
    expect(parsed.loop?.endSample).toBe(1250);
    expect(parsed.loop?.lengthSamples).toBe(1000);
  });

  it("rejects invalid WAV block alignment before allocating PCM buffers", () => {
    const wav = createTestWav(48000, 2, 16, 1000, null);
    wav.writeUInt16LE(1, 32);

    expect(() => parseWav(wav)).toThrow(/block align/i);
  });

  it("rejects invalid WAV sample rates with a clear error", () => {
    const wav = createTestWav(48000, 1, 16, 1000, null);
    wav.writeUInt32LE(0, 24);

    expect(() => parseWav(wav)).toThrow(/sample rate/i);
  });
});

describe("match scoring", () => {
  it("scores identical windows as 100 percent", () => {
    const mono = new Float32Array(1000);
    for (let i = 0; i < 500; i += 1) {
      mono[i] = Math.sin(i / 13);
      mono[i + 500] = mono[i];
    }

    expect(measureMatch(mono, 0, 500, 500)).toBeCloseTo(100, 4);
  });

  it("keeps correlation-sensitive musical repeats above strict sample-error matching", () => {
    const mono = new Float32Array(1000);
    for (let i = 0; i < 500; i += 1) {
      mono[i] = Math.sin(i / 13) * 0.8;
      mono[i + 500] = Math.sin(i / 13) * 0.72;
    }

    expect(measureMatch(mono, 0, 500, 500)).toBeGreaterThan(95);
  });

  it("finds a Deep loop candidate from repeated musical segments", () => {
    const sampleRate = 1000;
    const introSamples = 600;
    const loopSamples = 1400;
    const tailSamples = 700;
    const mono = new Float32Array(introSamples + loopSamples * 2 + tailSamples);
    for (let i = 0; i < loopSamples; i += 1) {
      const beat = i % 250 < 24 ? 0.35 : 0;
      const tone = Math.sin((i / sampleRate) * Math.PI * 2 * 7) * 0.45;
      const overtone = Math.sin((i / sampleRate) * Math.PI * 2 * 13) * 0.15;
      const value = tone + overtone + beat;
      mono[introSamples + i] = value;
      mono[introSamples + loopSamples + i] = value * 0.96;
    }
    const settings: DetectionSettings = {
      mode: "deep",
      matchWindowMs: 500,
      matchThreshold: 85,
      minimumLoopMs: 1000,
      loopCheckPrerollMs: 1000
    };

    const candidate = findBestLoopDeep(mono, sampleRate, settings, null);

    expect(candidate).not.toBeNull();
    expect(candidate?.confidence).toBeGreaterThan(85);
    expect(candidate?.end - candidate!.start).toBeGreaterThanOrEqual(1000);
  });
});

describe("MP3 metadata", () => {
  it("reads MPEG Layer III frames after an ID3v2 tag", () => {
    const mp3 = createTestMp3(4, true);
    const parsed = parseMp3(mp3);

    expect(parsed.format).toBe("mp3");
    expect(parsed.sampleRate).toBe(44100);
    expect(parsed.channels).toBe(2);
    expect(parsed.bitDepth).toBeNull();
    expect(parsed.durationSamples).toBe(4 * 1152);
    expect(parsed.loop).toBeNull();
  });

  it("rejects files without MPEG Layer III frames", () => {
    expect(() => parseMp3(Buffer.from("not an mp3"))).toThrow(/Layer III frames/i);
  });

  it("keeps MP3 loop markers app-local and warns on embedded save", async () => {
    const loop: LoopMarker = {
      startSample: 1000,
      endSample: 5000,
      lengthSamples: 4000,
      confidence: 97,
      source: "detected"
    };
    const track: TrackInfo = {
      id: "mp3-test",
      filePath: "missing.mp3",
      fileName: "missing.mp3",
      outputPath: "missing_looped.mp3",
      format: "mp3",
      sampleRate: 44100,
      bitDepth: null,
      channels: 2,
      durationSamples: 10000,
      durationMs: 226.76,
      loop,
      status: "detected",
      validation: "Detected at 97.0%.",
      waveform: null
    };

    const result = await saveLoopedCopy(track);

    expect(result.status).toBe("warning");
    expect(result.validation).toMatch(/cannot be embedded/i);
  });
});

describe("FLAC metadata", () => {
  it("reads and writes loop markers in Vorbis comments", () => {
    const input = createTestFlac(44100, 2, 16, 10000, ["TITLE=stage"]);
    const loop: LoopMarker = {
      startSample: 1200,
      endSample: 8800,
      lengthSamples: 7600,
      confidence: 96,
      source: "detected"
    };

    const output = writeFlacLoop(input, loop);
    const parsed = parseFlac(output);

    expect(parsed.format).toBe("flac");
    expect(parsed.sampleRate).toBe(44100);
    expect(parsed.channels).toBe(2);
    expect(parsed.bitDepth).toBe(16);
    expect(parsed.durationSamples).toBe(10000);
    expect(parsed.loop?.startSample).toBe(1200);
    expect(parsed.loop?.endSample).toBe(8800);
    expect(parsed.loop?.lengthSamples).toBe(7600);
  });
});

describe("Ogg Opus metadata", () => {
  it("reads and writes loop markers in OpusTags comments", () => {
    const input = createTestOpus(96000, ["ARTIST=AutoLooper"]);
    const initial = parseOggOpus(input);
    expect(initial.format).toBe("opus");
    expect(initial.sampleRate).toBe(48000);
    expect(initial.channels).toBe(2);
    expect(initial.durationSamples).toBe(96000);
    expect(initial.loop).toBeNull();

    const output = writeOggOpusLoop(input, {
      startSample: 24000,
      endSample: 72000,
      lengthSamples: 48000,
      confidence: 91,
      source: "detected"
    });
    const parsed = parseOggOpus(output);

    expect(parsed.loop?.startSample).toBe(24000);
    expect(parsed.loop?.endSample).toBe(72000);
    expect(parsed.loop?.lengthSamples).toBe(48000);
  });
});

describe("save output paths", () => {
  it("uses a custom output directory and filename suffix", () => {
    const outputPath = makeLoopedOutputPath("C:\\music\\stage.wav", {
      outputDirectory: "D:\\exports",
      filenameSuffix: "_game_loop"
    });

    expect(outputPath).toBe("D:\\exports\\stage_game_loop.wav");
  });
});

function createTestWav(
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
  frames: number,
  loop: LoopMarker | null
): Buffer {
  const blockAlign = channels * (bitsPerSample / 8);
  const data = Buffer.alloc(frames * blockAlign);
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      data.writeInt16LE(Math.round(Math.sin(frame / 11) * 12000), frame * blockAlign + channel * 2);
    }
  }

  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0, "ascii");
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(channels, 10);
  fmt.writeUInt32LE(sampleRate, 12);
  fmt.writeUInt32LE(sampleRate * blockAlign, 16);
  fmt.writeUInt16LE(blockAlign, 20);
  fmt.writeUInt16LE(bitsPerSample, 22);

  const dataChunk = Buffer.alloc(8);
  dataChunk.write("data", 0, "ascii");
  dataChunk.writeUInt32LE(data.length, 4);

  const parts = [Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), fmt, dataChunk, data];
  let wav = Buffer.concat(parts);
  wav.writeUInt32LE(wav.length - 8, 4);

  if (loop) {
    wav = writeWavLoop(wav, loop);
  }

  return wav;
}

function createTestFlac(sampleRate: number, channels: number, bitDepth: number, samples: number, comments: string[]): Buffer {
  const streamInfo = Buffer.alloc(34);
  const packed =
    (BigInt(sampleRate) << 44n) |
    (BigInt(channels - 1) << 41n) |
    (BigInt(bitDepth - 1) << 36n) |
    BigInt(samples);
  streamInfo.writeBigUInt64BE(packed, 10);
  return Buffer.concat([
    Buffer.from("fLaC", "ascii"),
    createFlacMetadataBlock(0, streamInfo, false),
    createFlacMetadataBlock(4, createVorbisCommentBlock("AutoLooperTest", comments), true),
    Buffer.alloc(16)
  ]);
}

function createFlacMetadataBlock(type: number, data: Buffer, isLast: boolean): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt8((isLast ? 0x80 : 0) | type, 0);
  header.writeUIntBE(data.length, 1, 3);
  return Buffer.concat([header, data]);
}

function createVorbisCommentBlock(vendorText: string, comments: string[]): Buffer {
  const vendor = Buffer.from(vendorText, "utf8");
  const parts: Buffer[] = [];
  const vendorLength = Buffer.alloc(4);
  vendorLength.writeUInt32LE(vendor.length, 0);
  parts.push(vendorLength, vendor);
  const count = Buffer.alloc(4);
  count.writeUInt32LE(comments.length, 0);
  parts.push(count);
  for (const commentText of comments) {
    const comment = Buffer.from(commentText, "utf8");
    const length = Buffer.alloc(4);
    length.writeUInt32LE(comment.length, 0);
    parts.push(length, comment);
  }
  return Buffer.concat(parts);
}

function createTestOpus(durationSamples: number, comments: string[]): Buffer {
  const serial = 0x12345678;
  const preSkip = 312;
  const head = Buffer.alloc(19);
  head.write("OpusHead", 0, "ascii");
  head.writeUInt8(1, 8);
  head.writeUInt8(2, 9);
  head.writeUInt16LE(preSkip, 10);
  head.writeUInt32LE(48000, 12);
  const tags = Buffer.concat([Buffer.from("OpusTags", "ascii"), createVorbisCommentBlock("AutoLooperTest", comments)]);
  return Buffer.concat([
    createOggPage(head, 0x02, 0n, serial, 0),
    createOggPage(tags, 0x00, 0n, serial, 1),
    createOggPage(Buffer.from([0xf8]), 0x04, BigInt(durationSamples + preSkip), serial, 2)
  ]);
}

function createOggPage(packet: Buffer, headerType: number, granule: bigint, serial: number, sequence: number): Buffer {
  const segments = packetToSegments(packet);
  const header = Buffer.alloc(27 + segments.length);
  header.write("OggS", 0, "ascii");
  header.writeUInt8(0, 4);
  header.writeUInt8(headerType, 5);
  header.writeBigUInt64LE(granule, 6);
  header.writeUInt32LE(serial, 14);
  header.writeUInt32LE(sequence, 18);
  header.writeUInt32LE(0, 22);
  header.writeUInt8(segments.length, 26);
  Buffer.from(segments).copy(header, 27);
  return Buffer.concat([header, packet]);
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

function createTestMp3(frameCount: number, withId3: boolean): Buffer {
  const frameLength = Math.floor((144000 * 128) / 44100);
  const header = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
  const frame = Buffer.concat([header, Buffer.alloc(frameLength - header.length)]);
  const frames = Array.from({ length: frameCount }, () => frame);

  if (!withId3) {
    return Buffer.concat(frames);
  }

  const tagPayload = Buffer.from("test");
  const id3 = Buffer.alloc(10);
  id3.write("ID3", 0, "ascii");
  id3[3] = 4;
  id3[4] = 0;
  id3[6] = 0;
  id3[7] = 0;
  id3[8] = 0;
  id3[9] = tagPayload.length;
  return Buffer.concat([id3, tagPayload, ...frames]);
}
