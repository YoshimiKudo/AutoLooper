import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from "electron";
import type { MenuItemConstructorOptions, OpenDialogOptions } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import type { DetectionSettings, ImportResult, LoopMarker, SaveOptions, TrackInfo } from "../shared/types.js";
import { detectTrackLoop } from "./services/detect.js";
import { importAudioFiles, saveLoopedCopy } from "./services/files.js";
import { readLimitedAudioFile } from "./services/limits.js";

const isDev = !app.isPackaged;
const devServerUrl = "http://127.0.0.1:5173";
const appIconPath = path.join(app.getAppPath(), "build", "icon.ico");
const importedTracks = new Map<string, TrackInfo>();
const importedFilePaths = new Set<string>();
const savedOutputPaths = new Set<string>();

app.enableSandbox();

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1540,
    height: 960,
    minWidth: 1480,
    minHeight: 880,
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

function configurePermissions(): void {
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    const url = webContents?.getURL() ?? "";
    return isAllowedNavigationUrl(url) && isAllowedSessionPermission(permission);
  });

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents.getURL();
    callback(isAllowedNavigationUrl(url) && isAllowedSessionPermission(permission));
  });
}

function isAllowedSessionPermission(permission: string): boolean {
  return permission === "clipboard-read" || permission === "clipboard-sanitized-write";
}

app.whenReady().then(() => {
  configurePermissions();
  createApplicationMenu();

  ipcMain.handle("tracks:import", async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const options: OpenDialogOptions = {
      title: "Import audio files",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Audio", extensions: ["wav", "aif", "aiff", "ogg", "mp3", "flac", "opus"] },
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
      return ext === ".wav" || ext === ".aif" || ext === ".aiff" || ext === ".ogg" || ext === ".mp3" || ext === ".flac" || ext === ".opus";
    });

    if (supportedPaths.length === 0) {
      return { tracks: [], errors: ["Drop WAV, AIFF, AIF, OGG, MP3, FLAC, or OPUS files."] };
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

  ipcMain.handle("tracks:save-looped", async (_event, tracks: unknown, options: Partial<SaveOptions> | undefined) => {
    if (!Array.isArray(tracks)) {
      return [];
    }

    const safeOptions = sanitizeSaveOptions(options);
    if (!safeOptions.ok) {
      return tracks.map((track) => ({
        id: getTrackId(track),
        outputPath: "",
        status: "error",
        validation: safeOptions.error
      }));
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
      const result = await saveLoopedCopy(resolution.track, safeOptions.options);
      if (result.status === "saved" && result.outputPath) {
        savedOutputPaths.add(normalizeFilePath(result.outputPath));
      }
      results.push(result);
    }
    return results;
  });

  ipcMain.handle("app:select-output-directory", async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, { title: "Select output folder", properties: ["openDirectory"] })
      : await dialog.showOpenDialog({ title: "Select output folder", properties: ["openDirectory"] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle("app:open-saved-folder", async (_event, outputPath: unknown) => {
    if (typeof outputPath !== "string") {
      throw new Error("Saved output path is invalid.");
    }
    const normalized = normalizeFilePath(outputPath);
    if (!savedOutputPaths.has(normalized)) {
      throw new Error("Only folders for files saved in this session can be opened.");
    }
    return shell.openPath(path.dirname(outputPath));
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

function createApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" }
            ]
          } satisfies MenuItemConstructorOptions
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Save Settings...",
          click: () => sendRendererMenuEvent("app:open-save-settings")
        },
        { type: "separator" },
        process.platform === "darwin" ? { role: "close" } : { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "close" }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function sendRendererMenuEvent(channel: string): void {
  const target = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  target?.webContents.send(channel);
}

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
    mode: settings?.mode === "deep" ? "deep" : "normal",
    matchWindowMs: clampNumber(settings?.matchWindowMs, 100, 30000, 1500),
    matchThreshold: clampNumber(settings?.matchThreshold, 1, 100, 88),
    minimumLoopMs: clampNumber(settings?.minimumLoopMs, 100, 600000, 3000),
    loopCheckPrerollMs: clampNumber(settings?.loopCheckPrerollMs, 0, 30000, 1000)
  };
}

function sanitizeSaveOptions(options: Partial<SaveOptions> | undefined): { ok: true; options: SaveOptions } | { ok: false; error: string } {
  const filenameSuffix = typeof options?.filenameSuffix === "string" ? options.filenameSuffix.trim() : "_looped";
  if (/[\x00-\x1f\\/:*?"<>|]/.test(filenameSuffix)) {
    return { ok: false, error: 'Filename suffix cannot contain \\ / : * ? " < > | or control characters.' };
  }
  if (filenameSuffix.length > 80) {
    return { ok: false, error: "Filename suffix is too long." };
  }
  const outputDirectory =
    typeof options?.outputDirectory === "string" && options.outputDirectory.trim()
      ? path.resolve(options.outputDirectory)
      : null;
  return {
    ok: true,
    options: {
      outputDirectory,
      filenameSuffix
    }
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}
