import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { DetectionResult, DetectionSettings, ImportResult, SaveResult, TrackInfo } from "../shared/types.js";

type DropImportCallback = (result: ImportResult) => void;
type FileDragStateCallback = (active: boolean) => void;
type DropImportStateCallback = (state: { active: boolean; count: number }) => void;

const dropImportCallbacks = new Set<DropImportCallback>();
const fileDragStateCallbacks = new Set<FileDragStateCallback>();
const dropImportStateCallbacks = new Set<DropImportStateCallback>();
let fileDragActive = false;

const api = {
  importFiles: () => ipcRenderer.invoke("tracks:import") as Promise<ImportResult>,
  importPaths: (filePaths: string[]) => ipcRenderer.invoke("tracks:import-paths", filePaths) as Promise<ImportResult>,
  onDroppedFilesImported: (callback: DropImportCallback) => {
    dropImportCallbacks.add(callback);
    return () => {
      dropImportCallbacks.delete(callback);
    };
  },
  onFileDragStateChanged: (callback: FileDragStateCallback) => {
    fileDragStateCallbacks.add(callback);
    return () => {
      fileDragStateCallbacks.delete(callback);
    };
  },
  onDroppedFilesImportStateChanged: (callback: DropImportStateCallback) => {
    dropImportStateCallbacks.add(callback);
    return () => {
      dropImportStateCallbacks.delete(callback);
    };
  },
  readAudioFile: (filePath: string) => ipcRenderer.invoke("tracks:read-file", filePath) as Promise<ArrayBuffer>,
  getReadme: () => ipcRenderer.invoke("app:get-readme") as Promise<string>,
  detectTracks: (tracks: TrackInfo[], settings: DetectionSettings) =>
    ipcRenderer.invoke("tracks:detect", tracks, settings) as Promise<DetectionResult[]>,
  saveLoopedCopies: (tracks: TrackInfo[]) =>
    ipcRenderer.invoke("tracks:save-looped", tracks) as Promise<SaveResult[]>
};

contextBridge.exposeInMainWorld("autoLooper", api);

export type AutoLooperApi = typeof api;

window.addEventListener("dragenter", (event) => {
  if (!hasFiles(event)) return;
  acceptFileDrag(event);
  setFileDragActive(true);
}, true);

window.addEventListener("dragover", (event) => {
  if (!hasFiles(event)) return;
  acceptFileDrag(event);
  setFileDragActive(true);
}, true);

window.addEventListener("dragleave", (event) => {
  if (!hasFiles(event)) return;
  acceptFileDrag(event);
  const x = event.clientX;
  const y = event.clientY;
  if (x <= 0 || y <= 0 || x >= window.innerWidth || y >= window.innerHeight) {
    setFileDragActive(false);
  }
}, true);

window.addEventListener("drop", (event) => {
  if (!hasFiles(event)) return;
  acceptFileDrag(event);
  setFileDragActive(false);
  void importDroppedFiles(event.dataTransfer?.files);
}, true);

function acceptFileDrag(event: DragEvent): void {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
}

function hasFiles(event: DragEvent): boolean {
  const types = Array.from(event.dataTransfer?.types ?? []);
  return types.includes("Files") || (event.dataTransfer?.files?.length ?? 0) > 0;
}

async function importDroppedFiles(files: FileList | undefined): Promise<void> {
  const filePaths = Array.from(files ?? [])
    .map((file) => webUtils.getPathForFile(file))
    .filter((filePath) => filePath.length > 0);
  notifyDropImportStateCallbacks({ active: true, count: filePaths.length });
  try {
    const result = await ipcRenderer.invoke("tracks:import-paths", filePaths) as ImportResult;
    notifyDropImportCallbacks(result);
  } catch (error) {
    notifyDropImportCallbacks({
      tracks: [],
      errors: [error instanceof Error ? error.message : "Dropped file import failed."]
    });
  } finally {
    notifyDropImportStateCallbacks({ active: false, count: 0 });
  }
}

function notifyDropImportCallbacks(result: ImportResult): void {
  for (const callback of dropImportCallbacks) {
    callback(result);
  }
}

function setFileDragActive(active: boolean): void {
  if (fileDragActive === active) return;
  fileDragActive = active;
  for (const callback of fileDragStateCallbacks) {
    callback(active);
  }
}

function notifyDropImportStateCallbacks(state: { active: boolean; count: number }): void {
  for (const callback of dropImportStateCallbacks) {
    callback(state);
  }
}
