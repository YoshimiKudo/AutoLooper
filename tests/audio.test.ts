import { describe, expect, it } from "vitest";
import type { LoopMarker } from "../src/shared/types";
import { measureMatch } from "../src/shared/detectCore";
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
