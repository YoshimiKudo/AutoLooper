import type { WaveformPeaks } from "../../shared/types.js";

export function buildWaveformPeaks(pcm: Float32Array[], targetPoints = 1400): WaveformPeaks {
  const samples = pcm[0]?.length ?? 0;
  const resolution = Math.max(1, Math.ceil(samples / targetPoints));
  const channels = pcm.map((channel) => {
    const min: number[] = [];
    const max: number[] = [];
    for (let i = 0; i < samples; i += resolution) {
      let lo = 1;
      let hi = -1;
      const end = Math.min(samples, i + resolution);
      for (let j = i; j < end; j += 1) {
        const value = channel[j] ?? 0;
        if (value < lo) lo = value;
        if (value > hi) hi = value;
      }
      min.push(Number.isFinite(lo) ? lo : 0);
      max.push(Number.isFinite(hi) ? hi : 0);
    }
    return { min, max };
  });
  return { resolution, channels };
}

export function downmixMono(pcm: Float32Array[]): Float32Array {
  const samples = pcm[0]?.length ?? 0;
  const mono = new Float32Array(samples);
  if (pcm.length === 0) {
    return mono;
  }

  for (let i = 0; i < samples; i += 1) {
    let sum = 0;
    for (const channel of pcm) {
      sum += channel[i] ?? 0;
    }
    mono[i] = sum / pcm.length;
  }
  return mono;
}
