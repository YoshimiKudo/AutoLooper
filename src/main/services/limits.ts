import fs from "node:fs/promises";

export const maxAudioFileBytes = 512 * 1024 * 1024;

export async function readLimitedAudioFile(filePath: string): Promise<Buffer> {
  const stat = await fs.stat(filePath);
  if (stat.size > maxAudioFileBytes) {
    throw new Error(`Audio file is too large. Maximum supported size is ${Math.round(maxAudioFileBytes / 1024 / 1024)} MB.`);
  }
  return fs.readFile(filePath);
}
