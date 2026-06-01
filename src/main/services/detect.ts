import type { DetectionResult, DetectionSettings, LoopMarker, TrackInfo } from "../../shared/types.js";
import { findBestLoop } from "../../shared/detectCore.js";
import { decodeAiff } from "../audio/aiff.js";
import { decodeWav } from "../audio/wav.js";
import { downmixMono } from "../audio/waveform.js";
import { readLimitedAudioFile } from "./limits.js";

export async function detectTrackLoop(track: TrackInfo, settings: DetectionSettings): Promise<DetectionResult> {
  try {
    const buffer = await readLimitedAudioFile(track.filePath);
    const decoded = track.format === "wav" ? decodeWav(buffer) : track.format === "aiff" ? decodeAiff(buffer) : null;
    if (!decoded) {
      return {
        id: track.id,
        loop: track.loop,
        status: "error",
        validation: "Use the renderer WebAudio path for Ogg Vorbis detection."
      };
    }
    const mono = downmixMono(decoded.pcm);
    const candidate = findBestLoop(mono, decoded.sampleRate, settings, decoded.loop);
    if (!candidate) {
      return {
        id: track.id,
        loop: null,
        status: "no-loop",
        validation: `No loop candidate reached ${settings.matchThreshold}%.`
      };
    }

    const loop: LoopMarker = {
      startSample: candidate.start,
      endSample: candidate.end,
      lengthSamples: candidate.end - candidate.start,
      confidence: candidate.confidence,
      source: candidate.source
    };
    const status = candidate.confidence >= settings.matchThreshold ? "detected" : "low-confidence";
    return {
      id: track.id,
      loop,
      status,
      validation: `Detected at ${candidate.confidence.toFixed(1)}%.`
    };
  } catch (error) {
    return {
      id: track.id,
      loop: track.loop,
      status: "error",
      validation: error instanceof Error ? error.message : String(error)
    };
  }
}
