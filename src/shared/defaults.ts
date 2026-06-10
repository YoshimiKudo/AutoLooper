import type { AppPreferences, DetectionSettings, SaveOptions } from "./types";

export const defaultDetectionSettings: DetectionSettings = {
  mode: "normal",
  matchWindowMs: 1500,
  matchThreshold: 88,
  minimumLoopMs: 3000,
  loopCheckPrerollMs: 1000
};

export const defaultSaveOptions: SaveOptions = {
  outputDirectory: null,
  filenameSuffix: "_looped"
};

export const defaultAppPreferences: AppPreferences = {
  language: "ja",
  displayUnit: "samples",
  detectionPreset: "normal",
  detectionSettings: defaultDetectionSettings,
  customDetectionSettings: null,
  saveOptions: defaultSaveOptions
};
