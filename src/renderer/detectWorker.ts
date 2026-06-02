import { findBestLoop, findBestLoopDeep, type LoopCandidate } from "../shared/detectCore";
import type { DetectionSettings, LoopMarker } from "../shared/types";

interface DetectWorkerRequest {
  requestId: string;
  mono: Float32Array;
  sampleRate: number;
  settings: DetectionSettings;
  metadataLoop: LoopMarker | null;
}

interface DetectWorkerResponse {
  requestId: string;
  candidate: LoopCandidate | null;
  error?: string;
}

self.addEventListener("message", (event: MessageEvent<DetectWorkerRequest>) => {
  const { requestId, mono, sampleRate, settings, metadataLoop } = event.data;
  try {
    const candidate = settings.mode === "deep"
      ? findBestLoopDeep(mono, sampleRate, settings, metadataLoop)
      : findBestLoop(mono, sampleRate, settings, metadataLoop);
    self.postMessage({ requestId, candidate } satisfies DetectWorkerResponse);
  } catch (error) {
    self.postMessage({
      requestId,
      candidate: null,
      error: error instanceof Error ? error.message : "Loop detection failed."
    } satisfies DetectWorkerResponse);
  }
});

export {};
