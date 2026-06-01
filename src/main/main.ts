import { app, BrowserWindow, dialog, ipcMain, session } from "electron";
import type { OpenDialogOptions } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import type { DetectionSettings, ImportResult, LoopMarker, TrackInfo } from "../shared/types.js";
import { detectTrackLoop } from "./services/detect.js";
import { importAudioFiles, saveLoopedCopy } from "./services/files.js";
import { readLimitedAudioFile } from "./services/limits.js";

const isDev = !app.isPackaged;
const devServerUrl = "http://127.0.0.1:5173";
const appIconPath = path.join(app.getAppPath(), "build", "icon.ico");
const importedTracks = new Map<string, TrackInfo>();
const importedFilePaths = new Set<string>();

app.enableSandbox();

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1540,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#091116",
    title: "AutoLooper",
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigationUrl(url)) {
      event.preventDefault();
    }
  });

  if (isDev) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(__dirname, "../../dist-renderer/index.html"));
  }
}

function isAllowedNavigationUrl(url: string): boolean {
  if (isDev) {
    return url.startsWith(devServerUrl);
  }
  return url.startsWith("file://");
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  ipcMain.handle("tracks:import", async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const options: OpenDialogOptions = {
      title: "Import audio files",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Audio", extensions: ["wav", "aif", "aiff", "ogg"] },
        { name: "All Files", extensions: ["*"] }
      ]
    };
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return { tracks: [], errors: [] };
    }

    return rememberImportedTracks(await importAudioFiles(result.filePaths));
  });

  ipcMain.handle("tracks:import-paths", async (_event, filePaths: unknown) => {
    if (!Array.isArray(filePaths)) {
      return { tracks: [], errors: ["No dropped files were provided."] };
    }

    const supportedPaths = filePaths.filter((filePath): filePath is string => {
      if (typeof filePath !== "string") return false;
      const ext = path.extname(filePath).toLowerCase();
      return ext === ".wav" || ext === ".aif" || ext === ".aiff" || ext === ".ogg";
    });

    if (supportedPaths.length === 0) {
      return { tracks: [], errors: ["Drop WAV, AIFF, AIF, or OGG files."] };
    }

    return rememberImportedTracks(await importAudioFiles(supportedPaths));
  });

  ipcMain.handle("tracks:detect", async (_event, tracks: unknown, settings: Partial<DetectionSettings> | undefined) => {
    if (!Array.isArray(tracks)) {
      return [];
    }

    const safeSettings = sanitizeDetectionSettings(settings);
    const results = [];
    for (const track of tracks) {
      const resolution = resolveImportedTrack(track);
      if (!resolution.track) {
        results.push({
          id: resolution.id,
          loop: null,
          status: "error",
          validation: resolution.error
        });
        continue;
      }
      results.push(await detectTrackLoop(resolution.track, safeSettings));
    }
    return results;
  });

  ipcMain.handle("tracks:read-file", async (_event, filePath: unknown) => {
    if (!isImportedFilePath(filePath)) {
      throw new Error("File is not in the imported track list.");
    }
    const buffer = await readLimitedAudioFile(filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  });

  ipcMain.handle("tracks:save-looped", async (_event, tracks: unknown) => {
    if (!Array.isArray(tracks)) {
      return [];
    }

    const results = [];
    for (const track of tracks) {
      const resolution = resolveImportedTrack(track, true);
      if (!resolution.track) {
        results.push({
          id: resolution.id,
          outputPath: "",
          status: "error",
          validation: resolution.error
        });
        continue;
      }
      results.push(await saveLoopedCopy(resolution.track));
    }
    return results;
  });

  ipcMain.handle("app:get-readme", async () => {
    return fs.readFile(path.join(app.getAppPath(), "README.md"), "utf8");
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function rememberImportedTracks(result: ImportResult): ImportResult {
  for (const track of result.tracks) {
    importedTracks.set(track.id, track);
    importedFilePaths.add(normalizeFilePath(track.filePath));
  }
  return result;
}

function resolveImportedTrack(track: unknown, useIncomingLoop = false): { id: string; track: TrackInfo | null; error: string } {
  if (!track || typeof track !== "object") {
    return { id: "", track: null, error: "Track payload is invalid." };
  }

  const incoming = track as Partial<TrackInfo>;
  const id = getTrackId(incoming);
  if (typeof incoming.id !== "string") {
    return { id, track: null, error: "Track id is invalid." };
  }

  const importedTrack = importedTracks.get(incoming.id);
  if (!importedTrack) {
    return { id, track: null, error: "File is not in the imported track list." };
  }

  if (
    typeof incoming.filePath === "string" &&
    normalizeFilePath(incoming.filePath) !== normalizeFilePath(importedTrack.filePath)
  ) {
    return { id, track: null, error: "Track path does not match the imported file." };
  }

  const loop =
    useIncomingLoop && Object.prototype.hasOwnProperty.call(incoming, "loop")
      ? normalizeLoopMarker(incoming.loop, importedTrack)
      : { ok: true as const, loop: importedTrack.loop };

  if (!loop.ok) {
    return { id, track: null, error: loop.error };
  }

  return {
    id,
    track: {
      ...importedTrack,
      loop: loop.loop,
      status: importedTrack.status,
      validation: importedTrack.validation
    },
    error: ""
  };
}

function normalizeLoopMarker(value: unknown, track: TrackInfo): { ok: true; loop: LoopMarker | null } | { ok: false; error: string } {
  if (value === null || value === undefined) {
    return { ok: true, loop: null };
  }
  if (!value || typeof value !== "object") {
    return { ok: false, error: "Loop marker payload is invalid." };
  }

  const incoming = value as Partial<LoopMarker>;
  const startSample = normalizeSample(incoming.startSample);
  const endSample = normalizeSample(incoming.endSample);
  if (startSample === null || endSample === null) {
    return { ok: false, error: "Loop start and end must be whole sample numbers." };
  }
  if (startSample < 0) {
    return { ok: false, error: "Loop start must be 0 or greater." };
  }
  if (endSample <= startSample) {
    return { ok: false, error: "Loop end must be greater than loop start." };
  }
  if (endSample > track.durationSamples) {
    return { ok: false, error: "Loop end must be inside the audio duration." };
  }

  const confidence =
    typeof incoming.confidence === "number" && Number.isFinite(incoming.confidence)
      ? Math.min(100, Math.max(0, incoming.confidence))
      : null;
  const source = incoming.source === "metadata" || incoming.source === "detected" ? incoming.source : "manual";
  return {
    ok: true,
    loop: {
      startSample,
      endSample,
      lengthSamples: endSample - startSample,
      confidence,
      source
    }
  };
}

function normalizeSample(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    return null;
  }
  return value;
}

function isImportedFilePath(filePath: unknown): filePath is string {
  return typeof filePath === "string" && importedFilePaths.has(normalizeFilePath(filePath));
}

function normalizeFilePath(filePath: string): string {
  return path.resolve(filePath).toLowerCase();
}

function getTrackId(track: unknown): string {
  if (track && typeof track === "object" && typeof (track as { id?: unknown }).id === "string") {
    return (track as { id: string }).id;
  }
  return "";
}

function sanitizeDetectionSettings(settings: Partial<DetectionSettings> | undefined): DetectionSettings {
  return {
    matchWindowMs: clampNumber(settings?.matchWindowMs, 100, 30000, 3000),
    matchThreshold: clampNumber(settings?.matchThreshold, 1, 100, 95),
    minimumLoopMs: clampNumber(settings?.minimumLoopMs, 100, 600000, 3000),
    loopCheckPrerollMs: clampNumber(settings?.loopCheckPrerollMs, 0, 30000, 1000)
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}
