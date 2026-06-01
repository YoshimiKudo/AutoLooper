export function formatSamples(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return Math.round(value).toLocaleString("en-US");
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${Math.round(value)}%`;
}

export function formatTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) {
    return "-";
  }
  const totalMs = Math.max(0, Math.round(ms));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function sampleToMs(sample: number, sampleRate: number): number {
  return sampleRate > 0 ? (sample / sampleRate) * 1000 : 0;
}

export function msToSample(ms: number, sampleRate: number): number {
  return Math.max(0, Math.round((ms / 1000) * sampleRate));
}
