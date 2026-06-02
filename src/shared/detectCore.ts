import type { DetectionSettings, LoopMarker } from "./types.js";

export interface LoopCandidate {
  start: number;
  end: number;
  confidence: number;
  source: "metadata" | "detected";
}

export function findBestLoop(
  mono: Float32Array,
  sampleRate: number,
  settings: DetectionSettings,
  metadataLoop: LoopMarker | null
): LoopCandidate | null {
  const windowSamples = Math.max(1, Math.round((settings.matchWindowMs / 1000) * sampleRate));
  const minimumLoopSamples = Math.max(1, Math.round((settings.minimumLoopMs / 1000) * sampleRate));
  if (mono.length < windowSamples * 2 || mono.length < minimumLoopSamples + windowSamples) {
    return null;
  }

  const candidates: LoopCandidate[] = [];
  if (metadataLoop && metadataLoop.startSample >= 0 && metadataLoop.endSample > metadataLoop.startSample) {
    const metadataWindowSamples = Math.min(windowSamples, mono.length - metadataLoop.startSample, mono.length - metadataLoop.endSample);
    if (metadataWindowSamples >= 1024) {
      candidates.push({
        start: metadataLoop.startSample,
        end: metadataLoop.endSample,
        confidence: measureMatch(mono, metadataLoop.startSample, metadataLoop.endSample, metadataWindowSamples, 1),
        source: "metadata"
      });
    }
  }

  const coarse = coarseSearch(mono, windowSamples, minimumLoopSamples, settings.matchThreshold);
  candidates.push(...coarse.map((item) => refineCandidate(mono, item.start, item.end, windowSamples)));
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates[0] ?? null;
}

export function findBestLoopDeep(
  mono: Float32Array,
  sampleRate: number,
  settings: DetectionSettings,
  metadataLoop: LoopMarker | null
): LoopCandidate | null {
  const normalCandidate = findBestLoop(mono, sampleRate, settings, metadataLoop);
  const windowSamples = Math.max(1, Math.round((settings.matchWindowMs / 1000) * sampleRate));
  const minimumLoopSamples = Math.max(1, Math.round((settings.minimumLoopMs / 1000) * sampleRate));
  if (mono.length < windowSamples * 2 || mono.length < minimumLoopSamples + windowSamples) {
    return normalCandidate;
  }

  const positions = buildOnsetAlignedPositions(mono, sampleRate, windowSamples);
  if (positions.length < 2) {
    return normalCandidate;
  }

  const featureSize = 64;
  const features = positions.map((position) => makeFeature(mono, position, windowSamples, featureSize));
  const loudness = positions.map((position) => estimateLoudnessDb(mono, position, Math.min(windowSamples, Math.round(sampleRate * 0.25))));
  const coarseThreshold = Math.max(45, Math.min(82, settings.matchThreshold - 12));
  const best: LoopCandidate[] = [];

  for (let i = 0; i < positions.length; i += 1) {
    for (let j = i + 1; j < positions.length; j += 1) {
      if (positions[j] - positions[i] < minimumLoopSamples) {
        continue;
      }
      const featureSimilarity = dot(features[i], features[j]) * 100;
      if (featureSimilarity < coarseThreshold) {
        continue;
      }
      const loudnessPenalty = Math.min(18, Math.abs(loudness[i] - loudness[j]) * 2.5);
      const candidateScore = clamp(featureSimilarity - loudnessPenalty, 0, 100);
      if (candidateScore < coarseThreshold) {
        continue;
      }
      insertBest(best, { start: positions[i], end: positions[j], confidence: candidateScore, source: "detected" }, 80);
    }
  }

  const refined = best
    .map((candidate) => refineCandidate(mono, candidate.start, candidate.end, windowSamples))
    .map((candidate) => applyZeroCrossingCorrection(mono, candidate, windowSamples))
    .map((candidate) => rescoreDeepCandidate(mono, candidate, windowSamples, sampleRate))
    .sort((a, b) => b.confidence - a.confidence);
  const deepCandidate = refined[0] ?? null;

  if (!deepCandidate) {
    return normalCandidate;
  }
  if (!normalCandidate) {
    return deepCandidate;
  }
  return deepCandidate.confidence >= normalCandidate.confidence - 1 ? deepCandidate : normalCandidate;
}

export function measureMatch(mono: Float32Array, aStart: number, bStart: number, length: number, stride = 1): number {
  let count = 0;
  let sumA = 0;
  let sumB = 0;
  let sumAA = 0;
  let sumBB = 0;
  let sumAB = 0;
  let sumErr = 0;
  let sumSignal = 0;
  for (let i = 0; i < length; i += stride) {
    const a = mono[aStart + i] ?? 0;
    const b = mono[bStart + i] ?? 0;
    count += 1;
    sumA += a;
    sumB += b;
    sumAA += a * a;
    sumBB += b * b;
    sumAB += a * b;
    const diff = a - b;
    sumErr += diff * diff;
    sumSignal += (a * a + b * b) / 2;
  }
  if (count === 0) {
    return 0;
  }
  const meanA = sumA / count;
  const meanB = sumB / count;
  const varianceA = Math.max(0, sumAA - count * meanA * meanA);
  const varianceB = Math.max(0, sumBB - count * meanB * meanB);
  const covariance = sumAB - count * meanA * meanB;
  const corr = covariance / Math.max(Math.sqrt(varianceA * varianceB), 1e-12);
  const corrSimilarity = clamp(corr * 100, 0, 100);
  const rmsErr = Math.sqrt(sumErr / count);
  const rmsSignal = Math.sqrt(sumSignal / count);
  const errorSimilarity = clamp((1 - rmsErr / Math.max(rmsSignal, 1e-12)) * 100, 0, 100);
  return clamp(0.75 * corrSimilarity + 0.25 * errorSimilarity, 0, 100);
}

function coarseSearch(mono: Float32Array, windowSamples: number, minimumLoopSamples: number, matchThreshold: number): LoopCandidate[] {
  const featureSize = 48;
  const maxFeaturePositions = 3500;
  const hop = Math.max(1024, Math.floor(windowSamples / 48), Math.ceil(Math.max(1, mono.length - windowSamples) / maxFeaturePositions));
  const coarseThreshold = Math.max(55, Math.min(88, matchThreshold - 8));
  const positions: number[] = [];
  const features: Float32Array[] = [];
  for (let position = 0; position + windowSamples < mono.length; position += hop) {
    positions.push(position);
    features.push(makeFeature(mono, position, windowSamples, featureSize));
  }

  const best: LoopCandidate[] = [];
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = i + 1; j < positions.length; j += 1) {
      if (positions[j] - positions[i] < minimumLoopSamples) {
        continue;
      }
      const confidence = dot(features[i], features[j]) * 100;
      if (confidence < coarseThreshold) {
        continue;
      }
      insertBest(best, { start: positions[i], end: positions[j], confidence, source: "detected" }, 64);
    }
  }
  return best;
}

function refineCandidate(mono: Float32Array, start: number, end: number, windowSamples: number): LoopCandidate {
  const radius = 2048;
  const step = 128;
  let best: LoopCandidate = { start, end, confidence: -Infinity, source: "detected" };
  for (let startOffset = -radius; startOffset <= radius; startOffset += step) {
    const refinedStart = start + startOffset;
    if (refinedStart < 0 || refinedStart + windowSamples >= mono.length) {
      continue;
    }
    for (let endOffset = -radius; endOffset <= radius; endOffset += step) {
      const refinedEnd = end + endOffset;
      if (refinedEnd <= refinedStart || refinedEnd + windowSamples >= mono.length) {
        continue;
      }
      const confidence = measureMatch(mono, refinedStart, refinedEnd, windowSamples, 16);
      if (confidence > best.confidence) {
        best = { start: refinedStart, end: refinedEnd, confidence, source: "detected" };
      }
    }
  }

  const fineRadius = 128;
  for (let startOffset = -fineRadius; startOffset <= fineRadius; startOffset += 8) {
    const refinedStart = best.start + startOffset;
    if (refinedStart < 0 || refinedStart + windowSamples >= mono.length) {
      continue;
    }
    for (let endOffset = -fineRadius; endOffset <= fineRadius; endOffset += 8) {
      const refinedEnd = best.end + endOffset;
      if (refinedEnd <= refinedStart || refinedEnd + windowSamples >= mono.length) {
        continue;
      }
      const confidence = measureMatch(mono, refinedStart, refinedEnd, windowSamples, 4);
      if (confidence > best.confidence) {
        best = { start: refinedStart, end: refinedEnd, confidence, source: "detected" };
      }
    }
  }

  return best;
}

function makeFeature(mono: Float32Array, start: number, length: number, size: number): Float32Array {
  const feature = new Float32Array(size);
  const block = Math.max(1, Math.floor(length / size));
  for (let i = 0; i < size; i += 1) {
    const blockStart = start + i * block;
    const blockEnd = Math.min(start + length, blockStart + block);
    let sumAbs = 0;
    let sumSquares = 0;
    let count = 0;
    for (let sample = blockStart; sample < blockEnd; sample += 32) {
      const value = mono[sample] ?? 0;
      sumAbs += Math.abs(value);
      sumSquares += value * value;
      count += 1;
    }
    const meanAbs = sumAbs / Math.max(1, count);
    const rms = Math.sqrt(sumSquares / Math.max(1, count));
    feature[i] = meanAbs * 0.65 + rms * 0.35;
  }

  let mean = 0;
  for (const value of feature) {
    mean += value;
  }
  mean /= size;
  let norm = 0;
  for (let i = 0; i < size; i += 1) {
    feature[i] -= mean;
    norm += feature[i] * feature[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < size; i += 1) {
    feature[i] /= norm;
  }
  return feature;
}

function buildOnsetAlignedPositions(mono: Float32Array, sampleRate: number, windowSamples: number): number[] {
  const hop = Math.max(256, Math.round(sampleRate / 100));
  const frameSize = Math.max(hop * 2, 1024);
  const rms: number[] = [];
  for (let start = 0; start + frameSize < mono.length; start += hop) {
    let sumSquares = 0;
    for (let i = start; i < start + frameSize; i += 1) {
      const value = mono[i] ?? 0;
      sumSquares += value * value;
    }
    rms.push(Math.sqrt(sumSquares / frameSize));
  }
  if (rms.length < 3) {
    return [];
  }

  const flux = rms.map((value, index) => Math.max(0, value - (rms[index - 1] ?? value)));
  const mean = flux.reduce((sum, value) => sum + value, 0) / flux.length;
  const variance = flux.reduce((sum, value) => sum + (value - mean) ** 2, 0) / flux.length;
  const threshold = mean + Math.sqrt(variance) * 0.55;
  const peaks: Array<{ position: number; strength: number }> = [];
  for (let i = 1; i < flux.length - 1; i += 1) {
    if (flux[i] < threshold || flux[i] < flux[i - 1] || flux[i] < flux[i + 1]) {
      continue;
    }
    const position = i * hop;
    if (position + windowSamples < mono.length) {
      peaks.push({ position, strength: flux[i] });
    }
  }

  const strongest = peaks
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 850)
    .map((peak) => peak.position);
  const regularHop = Math.max(windowSamples, Math.round(sampleRate));
  for (let position = 0; position + windowSamples < mono.length; position += regularHop) {
    strongest.push(position);
  }

  return Array.from(new Set(strongest))
    .filter((position) => position >= 0 && position + windowSamples < mono.length)
    .sort((a, b) => a - b);
}

function estimateLoudnessDb(mono: Float32Array, start: number, length: number): number {
  const end = Math.min(mono.length, start + Math.max(1, length));
  let sumSquares = 0;
  let count = 0;
  for (let i = start; i < end; i += 8) {
    const value = mono[i] ?? 0;
    sumSquares += value * value;
    count += 1;
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, count));
  return 20 * Math.log10(Math.max(rms, 1e-6));
}

function applyZeroCrossingCorrection(mono: Float32Array, candidate: LoopCandidate, windowSamples: number): LoopCandidate {
  const start = nearestZeroCrossing(mono, candidate.start, 256);
  const end = nearestZeroCrossing(mono, candidate.end, 256);
  if (end <= start || start + windowSamples >= mono.length || end + windowSamples >= mono.length) {
    return candidate;
  }
  const originalConfidence = measureMatch(mono, candidate.start, candidate.end, windowSamples, 4);
  const correctedConfidence = measureMatch(mono, start, end, windowSamples, 4);
  return correctedConfidence >= originalConfidence - 1.5
    ? { ...candidate, start, end, confidence: correctedConfidence }
    : candidate;
}

function nearestZeroCrossing(mono: Float32Array, position: number, radius: number): number {
  const from = Math.max(1, position - radius);
  const to = Math.min(mono.length - 2, position + radius);
  let best = position;
  let bestScore = Infinity;
  for (let i = from; i <= to; i += 1) {
    const previous = mono[i - 1] ?? 0;
    const current = mono[i] ?? 0;
    const crossesZero = (previous <= 0 && current >= 0) || (previous >= 0 && current <= 0);
    const score = Math.abs(current) + Math.abs(i - position) / radius + (crossesZero ? 0 : 0.5);
    if (score < bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

function rescoreDeepCandidate(mono: Float32Array, candidate: LoopCandidate, windowSamples: number, sampleRate: number): LoopCandidate {
  const matchConfidence = measureMatch(mono, candidate.start, candidate.end, windowSamples, 4);
  const loudnessA = estimateLoudnessDb(mono, candidate.start, Math.min(windowSamples, Math.round(sampleRate * 0.25)));
  const loudnessB = estimateLoudnessDb(mono, candidate.end, Math.min(windowSamples, Math.round(sampleRate * 0.25)));
  const loudnessPenalty = Math.min(10, Math.abs(loudnessA - loudnessB) * 1.5);
  return {
    ...candidate,
    confidence: clamp(matchConfidence - loudnessPenalty, 0, 100)
  };
}

function dot(a: Float32Array, b: Float32Array): number {
  let value = 0;
  for (let i = 0; i < a.length; i += 1) {
    value += a[i] * b[i];
  }
  return value;
}

function insertBest(best: LoopCandidate[], candidate: LoopCandidate, limit: number): void {
  if (best.length >= limit && candidate.confidence <= best[best.length - 1].confidence) {
    return;
  }
  best.push(candidate);
  best.sort((a, b) => b.confidence - a.confidence);
  if (best.length > limit) {
    best.length = limit;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
