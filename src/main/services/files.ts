import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { ImportResult, SaveResult, TrackInfo } from "../../shared/types.js";
import { parseAiff, writeAiffLoop } from "../audio/aiff.js";
import { parseMp3 } from "../audio/mp3.js";
import { parseOggVorbis, writeOggVorbisLoop } from "../audio/ogg.js";
import { parseWav, writeWavLoop } from "../audio/wav.js";
import { readLimitedAudioFile } from "./limits.js";

const mp3LoopEmbeddingUnsupported =
  "MP3 loop markers can be used inside AutoLooper, but cannot be embedded when saving MP3 files.";

export async function importAudioFiles(filePaths: string[]): Promise<ImportResult> {
  const tracks: TrackInfo[] = [];
  const errors: string[] = [];

  for (const filePath of filePaths) {
    try {
      const buffer = await readLimitedAudioFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const parsed =
        ext === ".wav"
          ? parseWav(buffer)
          : ext === ".aif" || ext === ".aiff"
            ? parseAiff(buffer)
            : ext === ".ogg"
              ? parseOggVorbis(buffer)
              : ext === ".mp3"
                ? parseMp3(buffer)
                : null;

      if (!parsed) {
        errors.push(`${filePath}: unsupported file type`);
        continue;
      }

      const fileName = path.basename(filePath);
      tracks.push({
        id: crypto.randomUUID(),
        filePath,
        fileName,
        outputPath: makeLoopedOutputPath(filePath),
        format: parsed.format,
        sampleRate: parsed.sampleRate,
        bitDepth: parsed.bitDepth,
        channels: parsed.channels,
        durationSamples: parsed.durationSamples,
        durationMs: parsed.sampleRate > 0 ? (parsed.durationSamples / parsed.sampleRate) * 1000 : 0,
        loop: parsed.loop,
        status: parsed.loop ? "detected" : "pending",
        validation: parsed.loop ? "Loop metadata loaded." : parsed.validation,
        waveform: parsed.waveform
      });
    } catch (error) {
      errors.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { tracks, errors };
}

export async function saveLoopedCopy(track: TrackInfo): Promise<SaveResult> {
  if (!track.loop) {
    return {
      id: track.id,
      outputPath: track.outputPath,
      status: "error",
      validation: "No loop marker is set."
    };
  }

  try {
    if (track.format === "mp3") {
      return {
        id: track.id,
        outputPath: track.outputPath,
        status: "warning",
        validation: mp3LoopEmbeddingUnsupported
      };
    }

    const input = await readLimitedAudioFile(track.filePath);
    const output =
      track.format === "wav"
        ? writeWavLoop(input, track.loop)
        : track.format === "aiff"
          ? writeAiffLoop(input, track.loop)
          : writeOggVorbisLoop(input, track.loop);

    const outputPath = await nextAvailablePath(makeLoopedOutputPath(track.filePath));
    await fs.writeFile(outputPath, output);
    return {
      id: track.id,
      outputPath,
      status: "saved",
      validation: `Saved ${path.basename(outputPath)}.`
    };
  } catch (error) {
    return {
      id: track.id,
      outputPath: track.outputPath,
      status: "error",
      validation: error instanceof Error ? error.message : String(error)
    };
  }
}

function makeLoopedOutputPath(filePath: string): string {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}_looped${parsed.ext}`);
}

async function nextAvailablePath(filePath: string): Promise<string> {
  const parsed = path.parse(filePath);
  let candidate = filePath;
  let index = 2;
  while (await exists(candidate)) {
    candidate = path.join(parsed.dir, `${parsed.name}_${index}${parsed.ext}`);
    index += 1;
  }
  return candidate;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
