import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { ImportResult, SaveOptions, SaveResult, TrackInfo } from "../../shared/types.js";
import { parseAiff, writeAiffLoop } from "../audio/aiff.js";
import { parseFlac, writeFlacLoop } from "../audio/flac.js";
import { parseMp3 } from "../audio/mp3.js";
import { parseOggOpus, parseOggVorbis, writeOggOpusLoop, writeOggVorbisLoop } from "../audio/ogg.js";
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
                : ext === ".flac"
                  ? parseFlac(buffer)
                  : ext === ".opus"
                    ? parseOggOpus(buffer)
                    : null;

      if (!parsed) {
        errors.push(`${filePath}: unsupported file type`);
        continue;
      }

      const fileName = basenameForPath(filePath);
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

export async function saveLoopedCopy(track: TrackInfo, options: SaveOptions = defaultSaveOptions): Promise<SaveResult> {
  if (!track.loop) {
    return {
      id: track.id,
      outputPath: makeLoopedOutputPath(track.filePath, options),
      status: "error",
      validation: "No loop marker is set."
    };
  }

  try {
    const intendedOutputPath = makeLoopedOutputPath(track.filePath, options);
    if (track.format === "mp3") {
      return {
        id: track.id,
        outputPath: intendedOutputPath,
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
          : track.format === "ogg"
            ? writeOggVorbisLoop(input, track.loop)
            : track.format === "flac"
              ? writeFlacLoop(input, track.loop)
              : writeOggOpusLoop(input, track.loop);

    const outputPath = await nextAvailablePath(intendedOutputPath);
    await fs.writeFile(outputPath, output);
    const validation =
      outputPath === intendedOutputPath
        ? `Saved ${basenameForPath(outputPath)}.`
        : `Saved ${basenameForPath(outputPath)} because ${basenameForPath(intendedOutputPath)} already exists.`;
    return {
      id: track.id,
      outputPath,
      status: "saved",
      validation
    };
  } catch (error) {
    return {
      id: track.id,
      outputPath: makeLoopedOutputPath(track.filePath, options),
      status: "error",
      validation: error instanceof Error ? error.message : String(error)
    };
  }
}

const defaultSaveOptions: SaveOptions = {
  outputDirectory: null,
  filenameSuffix: "_looped"
};

export function makeLoopedOutputPath(filePath: string, options: SaveOptions = defaultSaveOptions): string {
  const sourcePath = pathFor(filePath);
  const parsed = sourcePath.parse(filePath);
  const outputDirectory = options.outputDirectory || parsed.dir;
  const outputPath = pathFor(outputDirectory || filePath);
  return outputPath.join(outputDirectory, `${parsed.name}${options.filenameSuffix}${parsed.ext}`);
}

async function nextAvailablePath(filePath: string): Promise<string> {
  const pathModule = pathFor(filePath);
  const parsed = pathModule.parse(filePath);
  let candidate = filePath;
  let index = 2;
  while (await exists(candidate)) {
    candidate = pathModule.join(parsed.dir, `${parsed.name}_${index}${parsed.ext}`);
    index += 1;
  }
  return candidate;
}

function basenameForPath(filePath: string): string {
  return pathFor(filePath).basename(filePath);
}

function pathFor(filePath: string): path.PlatformPath {
  return isWindowsLikePath(filePath) ? path.win32 : path.posix;
}

function isWindowsLikePath(filePath: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.includes("\\");
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
