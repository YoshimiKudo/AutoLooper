export const maxAudioChannels = 64;
export const maxAudioSampleRate = 768000;
export const maxDecodedChannelSamples = 50_000_000;

export function validateAudioShape(format: string, channels: number, sampleRate: number, frames: number): void {
  if (!Number.isInteger(channels) || channels < 1 || channels > maxAudioChannels) {
    throw new Error(`Invalid ${format}: channel count must be between 1 and ${maxAudioChannels}, got ${channels}.`);
  }
  if (!Number.isInteger(sampleRate) || sampleRate < 1 || sampleRate > maxAudioSampleRate) {
    throw new Error(`Invalid ${format}: sample rate is out of range, got ${sampleRate}.`);
  }
  if (!Number.isSafeInteger(frames) || frames < 0) {
    throw new Error(`Invalid ${format}: frame count is invalid.`);
  }
  if (channels * frames > maxDecodedChannelSamples) {
    throw new Error(
      `Audio file is too long to decode safely. Maximum decoded sample cells: ${maxDecodedChannelSamples.toLocaleString("en-US")}.`
    );
  }
}
