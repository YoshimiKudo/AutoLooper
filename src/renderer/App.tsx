import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BookOpen, Copy, Crosshair, FileAudio, FolderOpen, Hash, Languages, Play, Repeat, Save, Search, Square, Table2, Trash2, Upload } from "lucide-react";
import type { DetectionResult, DetectionSettings, TrackInfo, TrackStatus, WaveformPeaks } from "../shared/types";
import { findBestLoop } from "../shared/detectCore";
import { formatPercent, formatSamples, formatTime, msToSample, sampleToMs } from "../shared/format";
import "./styles.css";

type ViewMode = "waveform" | "list";
type SortDirection = "asc" | "desc";
type PlaybackKind = "track" | "loop-check";
type Language = "ja" | "en";
type DetectionPreset = "high" | "mid" | "low" | "custom";
type DisplayUnit = "samples" | "time";

interface PlaybackSession {
  source: AudioBufferSourceNode;
  trackId: string;
  kind: PlaybackKind;
  sampleRate: number;
  durationSamples: number;
  startedAt: number;
  offsetSec: number;
  loopStartSec?: number;
  loopEndSec?: number;
  stoppedByUser: boolean;
}

interface SortRule {
  key: keyof TrackInfo | "confidence" | "loopStart" | "loopEnd" | "loopLength";
  direction: SortDirection;
}

interface TrackContextMenu {
  x: number;
  y: number;
  targetIds: string[];
}

interface CellSelection {
  anchorRow: number;
  anchorCol: number;
  focusRow: number;
  focusCol: number;
}

interface CheckboxSelectionDrag {
  shouldSelect: boolean;
}

type IssuePanelKind = "warnings" | "errors";

interface DetectionProgress {
  current: number;
  completed: number;
  total: number;
  currentFile: string;
  currentTrackId: string;
  startedAtMs: number;
  cancelRequested: boolean;
}

interface ImportProgress {
  total: number;
  startedAtMs: number;
}

const defaultSettings: DetectionSettings = {
  matchWindowMs: 3000,
  matchThreshold: 95,
  minimumLoopMs: 3000,
  loopCheckPrerollMs: 1000
};

const detectionPresets: Record<Exclude<DetectionPreset, "custom">, Pick<DetectionSettings, "matchWindowMs" | "matchThreshold" | "minimumLoopMs">> = {
  high: { matchWindowMs: 3000, matchThreshold: 95, minimumLoopMs: 3000 },
  mid: { matchWindowMs: 1500, matchThreshold: 88, minimumLoopMs: 3000 },
  low: { matchWindowMs: 1000, matchThreshold: 65, minimumLoopMs: 3000 }
};

const customPresetStorageKey = "autolooper.customDetectionPreset.v1";

const uiText = {
  ja: {
    ready: "準備完了",
    waveform: "波形",
    listEditor: "リスト編集",
    settings: "設定",
    importFiles: "ファイル読み込み",
    autoLoop: "自動ループ",
    autoLoopAll: "全て自動ループ",
    saveLoopedCopies: "ループ付きコピー保存",
    removeFromList: "リストから削除",
    files: "件",
    warnings: "警告",
    errors: "エラー",
    warningDetails: "警告内容",
    errorDetails: "エラー内容",
    readme: "README",
    readmeTitle: "README",
    readmeLoading: "README を読み込み中...",
    readmeFailed: "README を読み込めませんでした。",
    close: "閉じる",
    noIssueDetails: "表示する内容はありません。",
    sampleRate: "サンプルレート",
    bitDepth: "ビット深度",
    channels: "チャンネル",
    compressed: "圧縮",
    importingFiles: "ファイルを読み込み中...",
    importingDropped: "ドロップされたファイルを読み込み中...",
    importProgress: "読み込み中",
    importProgressDetail: "音声ファイルを解析しています",
    imported: "件読み込み",
    importedWithErrors: "件読み込み、エラー",
    autoLooping: "自動ループ検出中",
    autoLoopComplete: "自動ループ完了",
    autoLoopCanceled: "自動ループを中止しました",
    detectingNow: "検出中",
    cancelDetection: "検出を中止",
    cancelingDetection: "中止要求中",
    cancelDetectionDetail: "現在のファイル処理後に停止します",
    detectionProgress: "検出進捗",
    elapsedTime: "経過",
    scanningWaveform: "Scanning...",
    processed: "件処理",
    saving: "保存中",
    saveComplete: "保存完了",
    savedCount: "件保存",
    preparingPlayback: "再生準備中...",
    loadingPlayback: "再生を読み込み中",
    playing: "再生中",
    playbackEnded: "再生終了",
    playbackFailed: "再生失敗",
    stopped: "停止",
    setLoopBeforeCheck: "ループ確認の前にループポイントを設定してください。",
    stoppedLoopCheck: "ループ確認を停止",
    loadingLoopCheck: "ループ確認を読み込み中",
    checkingLoop: "ループ確認中",
    stoppedRemoved: "削除したトラックの再生を停止",
    removedFromList: "件をリストから削除しました。音声ファイル自体は削除していません。",
    emptyImport: "WAV、AIFF、Ogg Vorbis ファイルを読み込んでください。",
    play: "再生",
    stop: "停止",
    checkLoop: "ループ確認",
    stopCheck: "確認停止",
    file: "ファイル",
    format: "形式",
    status: "状態",
    confidence: "信頼度",
    loopStart: "ループ開始",
    loopEnd: "ループ終了",
    loopLength: "ループ長",
    duration: "長さ",
    durationSamples: "総サンプル数",
    loopStartSample: "ループ開始サンプル",
    loopEndSample: "ループ終了サンプル",
    outputName: "出力名",
    validation: "検証",
    pending: "未処理",
    processing: "検出中",
    detected: "検出済み",
    lowConfidence: "低信頼度",
    noLoopFound: "ループなし",
    edited: "編集済み",
    warningStatus: "警告",
    canceled: "中止",
    saved: "保存済み",
    error: "エラー",
    autoLoopSettings: "自動ループ設定",
    detectionPreset: "検出プリセット",
    highPreset: "High",
    midPreset: "Mid",
    lowPreset: "Low",
    customPreset: "カスタム",
    highPresetHelp: "現行の厳しめ設定。誤検出を抑えます。",
    midPresetHelp: "標準設定。やや揺れのあるループも拾います。",
    lowPresetHelp: "広めに探索。見落としを減らしますが候補確認が必要です。",
    customPresetHelp: "保存済みのカスタム設定です。",
    customPresetEmptyHelp: "カスタムは未保存です。現在の数値を保存すると次回以降も使えます。",
    saveCustomPreset: "カスタム保存",
    customPresetSaved: "カスタムプリセットを保存しました",
    matchWindow: "照合区間",
    matchWindowHelp: "ループ判定で比較する音声区間の長さです。",
    requiredMatch: "必要一致率",
    requiredMatchHelp: "候補を採用するために必要な最低スコアです。",
    minimumLoop: "最短ループ",
    minimumLoopHelp: "これより短い候補は無視します。",
    loopCheckPreroll: "ループ確認開始位置",
    loopCheckPrerollHelp: "ループ終了位置の何ms前から再生して継ぎ目を確認するかです。",
    loopPoints: "ループポイント",
    sort: "ソート",
    fileName: "ファイル名",
    loopStartEnd: "ループ開始 / 終了",
    rows: "行",
    samples: "サンプル",
    displaySamples: "表示: サンプル",
    displayTime: "表示: 秒",
    allStatuses: "全ての状態",
    pasteTable: "表を貼り付け",
    copySelected: "選択をコピー",
    copyRange: "選択範囲をコピー",
    filterPlaceholder: "ファイル、状態、形式、検証内容で絞り込み",
    languageButton: "Language",
    languageValue: "日本語"
  },
  en: {
    ready: "Ready",
    waveform: "Waveform",
    listEditor: "List Editor",
    settings: "Settings",
    importFiles: "Import Files",
    autoLoop: "Auto Loop",
    autoLoopAll: "Auto Loop All",
    saveLoopedCopies: "Save Looped Copies",
    removeFromList: "Remove from List",
    files: "files",
    warnings: "warnings",
    errors: "errors",
    warningDetails: "Warning Details",
    errorDetails: "Error Details",
    readme: "README",
    readmeTitle: "README",
    readmeLoading: "Loading README...",
    readmeFailed: "Could not load README.",
    close: "Close",
    noIssueDetails: "No details to show.",
    sampleRate: "Sample Rate",
    bitDepth: "Bit Depth",
    channels: "Channels",
    compressed: "compressed",
    importingFiles: "Importing files...",
    importingDropped: "Importing dropped files...",
    importProgress: "Importing",
    importProgressDetail: "Analyzing audio files",
    imported: "imported",
    importedWithErrors: "imported, errors",
    autoLooping: "Auto looping",
    autoLoopComplete: "Auto Loop complete",
    autoLoopCanceled: "Auto Loop canceled",
    detectingNow: "Detecting",
    cancelDetection: "Cancel Detection",
    cancelingDetection: "Cancel requested",
    cancelDetectionDetail: "Stopping after the current file finishes",
    detectionProgress: "Detection progress",
    elapsedTime: "Elapsed",
    scanningWaveform: "Scanning...",
    processed: "processed",
    saving: "Saving",
    saveComplete: "Save complete",
    savedCount: "saved",
    preparingPlayback: "Preparing playback...",
    loadingPlayback: "Loading playback",
    playing: "Playing",
    playbackEnded: "Playback ended",
    playbackFailed: "Playback failed",
    stopped: "Stopped",
    setLoopBeforeCheck: "Set loop points before checking the loop.",
    stoppedLoopCheck: "Stopped loop check",
    loadingLoopCheck: "Loading loop check",
    checkingLoop: "Checking loop",
    stoppedRemoved: "Stopped: removed track",
    removedFromList: "removed from the list. Files were not deleted.",
    emptyImport: "Import WAV, AIFF, or Ogg Vorbis files.",
    play: "Play",
    stop: "Stop",
    checkLoop: "Check Loop",
    stopCheck: "Stop Check",
    file: "File",
    format: "Format",
    status: "Status",
    confidence: "Confidence",
    loopStart: "Loop Start",
    loopEnd: "Loop End",
    loopLength: "Loop Length",
    duration: "Duration",
    durationSamples: "Duration Samples",
    loopStartSample: "Loop Start Sample",
    loopEndSample: "Loop End Sample",
    outputName: "Output Name",
    validation: "Validation",
    pending: "Pending",
    processing: "Processing",
    detected: "Detected",
    lowConfidence: "Low Confidence",
    noLoopFound: "No Loop Found",
    edited: "Edited",
    warningStatus: "Warning",
    canceled: "Canceled",
    saved: "Saved",
    error: "Error",
    autoLoopSettings: "Auto Loop Settings",
    detectionPreset: "Detection Preset",
    highPreset: "High",
    midPreset: "Mid",
    lowPreset: "Low",
    customPreset: "Custom",
    highPresetHelp: "Current strict setting. Reduces false positives.",
    midPresetHelp: "Balanced setting for loops with moderate variation.",
    lowPresetHelp: "Broad search. Reduces misses, but candidates need review.",
    customPresetHelp: "Saved custom detection settings.",
    customPresetEmptyHelp: "No custom preset is saved yet. Save the current values to reuse them later.",
    saveCustomPreset: "Save Custom",
    customPresetSaved: "Custom preset saved",
    matchWindow: "Match Window",
    matchWindowHelp: "Length of audio compared when judging whether two points loop cleanly.",
    requiredMatch: "Required Match",
    requiredMatchHelp: "Minimum similarity score needed before a candidate is accepted.",
    minimumLoop: "Minimum Loop",
    minimumLoopHelp: "Shortest allowed loop length. Shorter candidates are ignored.",
    loopCheckPreroll: "Loop Check Preroll",
    loopCheckPrerollHelp: "How many ms before Loop End playback starts when checking the seam.",
    loopPoints: "Loop Points",
    sort: "Sort",
    fileName: "File Name",
    loopStartEnd: "Loop Start / End",
    rows: "rows",
    samples: "samples",
    displaySamples: "Display: Samples",
    displayTime: "Display: Time",
    allStatuses: "All Statuses",
    pasteTable: "Paste Table",
    copySelected: "Copy Selected",
    copyRange: "Copy Range",
    filterPlaceholder: "Filter by file, status, format, or validation",
    languageButton: "Language",
    languageValue: "English"
  }
} as const;

type UiKey = keyof typeof uiText.ja;

function ui(language: Language, key: UiKey): string {
  return uiText[language][key];
}

function countText(language: Language, count: number, key: UiKey): string {
  return language === "ja" ? `${count}${ui(language, key)}` : `${count} ${ui(language, key)}`;
}

function emptyPosition(displayUnit: DisplayUnit): string {
  return displayUnit === "samples" ? "0" : "00:00.000";
}

function formatSamplePosition(sample: number | null | undefined, sampleRate: number, displayUnit: DisplayUnit): string {
  if (sample === null || sample === undefined || Number.isNaN(sample)) return "-";
  return displayUnit === "samples" ? formatSamples(sample) : formatTime(sampleToMs(sample, sampleRate));
}

function formatTrackDuration(track: TrackInfo, displayUnit: DisplayUnit): string {
  return displayUnit === "samples" ? formatSamples(track.durationSamples) : formatTime(track.durationMs);
}

function formatElapsedSeconds(seconds: number, language: Language): string {
  const value = Math.max(0, Math.floor(seconds));
  return language === "ja" ? `${value}秒` : `${value}s`;
}

function readSavedCustomPreset(): DetectionSettings | null {
  try {
    const raw = window.localStorage.getItem(customPresetStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DetectionSettings>;
    if (
      typeof parsed.matchWindowMs !== "number" ||
      typeof parsed.matchThreshold !== "number" ||
      typeof parsed.minimumLoopMs !== "number" ||
      typeof parsed.loopCheckPrerollMs !== "number"
    ) {
      return null;
    }
    return {
      matchWindowMs: parsed.matchWindowMs,
      matchThreshold: parsed.matchThreshold,
      minimumLoopMs: parsed.minimumLoopMs,
      loopCheckPrerollMs: parsed.loopCheckPrerollMs
    };
  } catch {
    return null;
  }
}

function waitForUiFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function resolveActiveTrackId(activeTrackId: string | null, selectedIds: string[], tracks: TrackInfo[]): string | null {
  const existingIds = new Set(tracks.map((track) => track.id));
  if (activeTrackId && selectedIds.includes(activeTrackId) && existingIds.has(activeTrackId)) {
    return activeTrackId;
  }
  for (let index = selectedIds.length - 1; index >= 0; index -= 1) {
    const id = selectedIds[index];
    if (existingIds.has(id)) return id;
  }
  return null;
}

export default function App(): React.ReactElement {
  const demoTracks = useMemo(() => createDemoTracks(), []);
  const [language, setLanguage] = useState<Language>("ja");
  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>("samples");
  const [tracks, setTracks] = useState<TrackInfo[]>(demoTracks);
  const [selectedIds, setSelectedIds] = useState<string[]>(demoTracks[0] ? [demoTracks[0].id] : []);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(demoTracks[0]?.id ?? null);
  const [settings, setSettings] = useState(defaultSettings);
  const [savedCustomSettings, setSavedCustomSettings] = useState<DetectionSettings | null>(() => readSavedCustomPreset());
  const [detectionPreset, setDetectionPreset] = useState<DetectionPreset>("high");
  const [view, setView] = useState<ViewMode>("waveform");
  const [sortRules, setSortRules] = useState<SortRule[]>([{ key: "fileName", direction: "asc" }]);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState(ui("ja", "ready"));
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [playbackKind, setPlaybackKind] = useState<PlaybackKind | null>(null);
  const [playhead, setPlayhead] = useState<{ trackId: string; sample: number } | null>(null);
  const [trackContextMenu, setTrackContextMenu] = useState<TrackContextMenu | null>(null);
  const [issuePanel, setIssuePanel] = useState<IssuePanelKind | null>(null);
  const [readmeOpen, setReadmeOpen] = useState(false);
  const [readmeContent, setReadmeContent] = useState<string | null>(null);
  const [readmeError, setReadmeError] = useState<string | null>(null);
  const [detectionProgress, setDetectionProgress] = useState<DetectionProgress | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const playbackRef = useRef<PlaybackSession | null>(null);
  const playbackRequestRef = useRef(0);
  const checkboxSelectionDragRef = useRef<CheckboxSelectionDrag | null>(null);
  const scanCancelRequestedRef = useRef(false);

  const selectedTrackId = detectionProgress?.currentTrackId ?? resolveActiveTrackId(activeTrackId, selectedIds, tracks);
  const selectedTrack = tracks.find((track) => track.id === selectedTrackId) ?? null;
  const visibleTracks = useMemo(() => sortTracks(filterTracks(tracks, filter), sortRules), [tracks, filter, sortRules]);
  const selectedTracks = tracks.filter((track) => selectedIds.includes(track.id));
  const activeTracks = selectedTracks;
  const removableTrackIds = selectedIds;
  const warningTracks = tracks.filter(isWarningTrack);
  const errorTracks = tracks.filter((track) => track.status === "error");
  const counts = { warnings: warningTracks.length, errors: errorTracks.length };
  const issueTracks = issuePanel === "warnings" ? warningTracks : issuePanel === "errors" ? errorTracks : [];
  const isDetecting = detectionProgress !== null;
  const isImporting = importProgress !== null;

  useEffect(() => {
    const unsubscribeImport = window.autoLooper.onDroppedFilesImported((result) => {
      setIsDraggingFiles(false);
      setImportProgress(null);
      applyImportResult(result);
    });
    const unsubscribeDragState = window.autoLooper.onFileDragStateChanged((active) => {
      setIsDraggingFiles(active);
    });
    const unsubscribeImportState = window.autoLooper.onDroppedFilesImportStateChanged((state) => {
      setIsDraggingFiles(false);
      if (state.active) {
        setImportProgress({ total: state.count, startedAtMs: Date.now() });
        setStatus(ui(language, "importingDropped"));
      } else {
        setImportProgress(null);
      }
    });
    return () => {
      unsubscribeImport();
      unsubscribeDragState();
      unsubscribeImportState();
    };
  }, [language]);

  useEffect(() => {
    const stopCheckboxSelectionDrag = () => {
      checkboxSelectionDragRef.current = null;
    };
    window.addEventListener("pointerup", stopCheckboxSelectionDrag);
    window.addEventListener("mouseup", stopCheckboxSelectionDrag);
    window.addEventListener("blur", stopCheckboxSelectionDrag);
    return () => {
      window.removeEventListener("pointerup", stopCheckboxSelectionDrag);
      window.removeEventListener("mouseup", stopCheckboxSelectionDrag);
      window.removeEventListener("blur", stopCheckboxSelectionDrag);
    };
  }, []);

  useEffect(() => {
    return () => {
      playbackRequestRef.current += 1;
      const playback = playbackRef.current;
      if (!playback) return;
      playback.stoppedByUser = true;
      playback.source.onended = null;
      try {
        playback.source.stop();
      } catch {
        // AudioBufferSourceNode can only be stopped once.
      }
      playbackRef.current = null;
    };
  }, []);

  useEffect(() => {
    let frameId = 0;
    const tick = () => {
      const playback = playbackRef.current;
      if (playback && audioContext) {
        const elapsedSec = Math.max(0, audioContext.currentTime - playback.startedAt);
        let positionSec = playback.offsetSec + elapsedSec;
        if (playback.loopStartSec !== undefined && playback.loopEndSec !== undefined && positionSec >= playback.loopEndSec) {
          const loopLengthSec = Math.max(0.001, playback.loopEndSec - playback.loopStartSec);
          positionSec = playback.loopStartSec + ((positionSec - playback.loopStartSec) % loopLengthSec);
        }
        setPlayhead({
          trackId: playback.trackId,
          sample: clamp(Math.round(positionSec * playback.sampleRate), 0, playback.durationSamples)
        });
      }
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" || removableTrackIds.length === 0) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest("input, textarea, select") || target.isContentEditable)) return;
      event.preventDefault();
      removeTracks(removableTrackIds);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [removableTrackIds]);

  useEffect(() => {
    if (issuePanel === "warnings" && warningTracks.length === 0) setIssuePanel(null);
    if (issuePanel === "errors" && errorTracks.length === 0) setIssuePanel(null);
  }, [issuePanel, warningTracks.length, errorTracks.length]);

  useEffect(() => {
    setActiveTrackId((current) => resolveActiveTrackId(current, selectedIds, tracks));
  }, [selectedIds, tracks]);

  function applyImportResult(result: { tracks: TrackInfo[]; errors: string[] }): void {
    if (result.tracks.length > 0) {
      setTracks((current) => [...current, ...result.tracks]);
      setSelectedIds([result.tracks[0].id]);
      setActiveTrackId(result.tracks[0].id);
    }
    setStatus(
      result.errors.length
        ? `${countText(language, result.tracks.length, "importedWithErrors")} ${result.errors.length}: ${result.errors[0]}`
        : countText(language, result.tracks.length, "imported")
    );
  }

  async function importFiles(): Promise<void> {
    setStatus(ui(language, "importingFiles"));
    try {
      applyImportResult(await window.autoLooper.importFiles());
    } catch (error) {
      setStatus(error instanceof Error ? `${ui(language, "error")}: ${error.message}` : ui(language, "error"));
    }
  }

  function updateSettings(patch: Partial<DetectionSettings>): void {
    setSettings((current) => ({ ...current, ...patch }));
    setDetectionPreset("custom");
  }

  function applyDetectionPreset(preset: DetectionPreset): void {
    if (preset === "custom") {
      if (!savedCustomSettings) return;
      setSettings(savedCustomSettings);
      setDetectionPreset("custom");
      return;
    }
    setSettings((current) => ({ ...current, ...detectionPresets[preset] }));
    setDetectionPreset(preset);
  }

  function saveCustomPreset(): void {
    const next = { ...settings };
    window.localStorage.setItem(customPresetStorageKey, JSON.stringify(next));
    setSavedCustomSettings(next);
    setDetectionPreset("custom");
    setStatus(ui(language, "customPresetSaved"));
  }

  async function detect(targets: TrackInfo[]): Promise<void> {
    if (targets.length === 0 || isDetecting || isImporting) return;
    const uniqueTargets = Array.from(new Map(targets.map((track) => [track.id, track])).values());
    const total = uniqueTargets.length;
    const results: DetectionResult[] = [];
    const startedAtMs = Date.now();
    let canceled = false;
    scanCancelRequestedRef.current = false;
    setStatus(`${ui(language, "autoLooping")}: 0/${total}`);
    try {
      for (let index = 0; index < uniqueTargets.length; index += 1) {
        if (scanCancelRequestedRef.current) {
          canceled = true;
          break;
        }
        const track = uniqueTargets[index];
        setDetectionProgress({
          current: index + 1,
          completed: index,
          total,
          currentFile: track.fileName,
          currentTrackId: track.id,
          startedAtMs,
          cancelRequested: false
        });
        setStatus(`${ui(language, "autoLooping")}: ${index + 1}/${total} ${track.fileName}`);
        setTracks((current) =>
          current.map((item) =>
            item.id === track.id
              ? { ...item, status: "processing", validation: `${ui(language, "autoLooping")}...` }
              : item
          )
        );
        await waitForUiFrame();

        const rendererResult =
          track.format === "ogg"
            ? await detectOggWithWebAudio(track, settings)
            : { result: (await window.autoLooper.detectTracks([track], settings))[0] };
        if (scanCancelRequestedRef.current) {
          canceled = true;
          setTracks((current) =>
            current.map((item) =>
              item.id === track.id
                ? { ...item, loop: track.loop, status: "canceled", validation: "Auto Loop canceled before this track finished." }
                : item
            )
          );
          break;
        }
        if (!rendererResult.result) continue;
        results.push(rendererResult.result);
        setTracks((current) =>
          current.map((item) =>
            item.id === track.id
              ? {
                  ...item,
                  ...(rendererResult.trackPatch ?? {}),
                  loop: rendererResult.result.loop,
                  status: rendererResult.result.status,
                  validation: rendererResult.result.validation
                }
              : item
          )
        );
        setDetectionProgress({
          current: index + 1,
          completed: index + 1,
          total,
          currentFile: track.fileName,
          currentTrackId: track.id,
          startedAtMs,
          cancelRequested: false
        });
        await waitForUiFrame();
      }
      setStatus(
        canceled
          ? `${ui(language, "autoLoopCanceled")}: ${results.length}/${countText(language, total, "processed")}`
          : `${ui(language, "autoLoopComplete")}: ${countText(language, results.length, "processed")}`
      );
    } finally {
      setDetectionProgress(null);
      scanCancelRequestedRef.current = false;
    }
  }

  function requestDetectionCancel(): void {
    if (!detectionProgress) return;
    scanCancelRequestedRef.current = true;
    setDetectionProgress((current) => current ? { ...current, cancelRequested: true } : current);
    setStatus(ui(language, "cancelingDetection"));
  }

  async function saveLooped(targets: TrackInfo[]): Promise<void> {
    if (targets.length === 0) return;
    setStatus(`${ui(language, "saving")}: ${targets.length}`);
    const results = await window.autoLooper.saveLoopedCopies(targets);
    setTracks((current) =>
      current.map((track) => {
        const result = results.find((item) => item.id === track.id);
        if (!result) return track;
        return {
          ...track,
          outputPath: result.outputPath,
          status: result.status,
          validation: result.validation
        };
      })
    );
    setStatus(`${ui(language, "saveComplete")}: ${results.filter((item) => item.status === "saved").length}/${countText(language, results.length, "savedCount")}`);
  }

  function patchTrack(id: string, patch: Partial<TrackInfo>): void {
    setTracks((current) => current.map((track) => (track.id === id ? { ...track, ...patch } : track)));
  }

  function removeTracks(ids: string[]): void {
    const removeSet = new Set(ids);
    if (removeSet.size === 0) return;
    if (playingTrackId && removeSet.has(playingTrackId)) {
      stopPlayback(ui(language, "stoppedRemoved"));
    }
    setTrackContextMenu(null);
    setTracks((current) => {
      const remaining = current.filter((track) => !removeSet.has(track.id));
      setSelectedIds((currentSelected) => {
        const kept = currentSelected.filter((id) => !removeSet.has(id));
        if (kept.length > 0) return kept;
        return remaining[0] ? [remaining[0].id] : [];
      });
      return remaining;
    });
    setStatus(countText(language, removeSet.size, "removedFromList"));
  }

  function stopPlayback(nextStatus = ui(language, "stopped")): void {
    playbackRequestRef.current += 1;
    const playback = playbackRef.current;
    if (!playback) {
      setPlayingTrackId(null);
      setPlaybackKind(null);
      setPlayhead(null);
      return;
    }
    playback.stoppedByUser = true;
    playback.source.onended = null;
    try {
      playback.source.stop();
    } catch {
      // AudioBufferSourceNode can only be stopped once.
    }
    playbackRef.current = null;
    setPlayingTrackId(null);
    setPlaybackKind(null);
    setPlayhead(null);
    setStatus(nextStatus);
  }

  async function togglePlayback(track: TrackInfo): Promise<void> {
    if (playingTrackId === track.id && playbackKind === "track") {
      stopPlayback(`${ui(language, "stopped")}: ${track.fileName}`);
      return;
    }

    await startPlayback(track, {
      kind: "track",
      offsetSample: 0,
      loopStartSample: track.loop?.startSample,
      loopEndSample: track.loop?.endSample,
      loadingStatus: `${ui(language, "loadingPlayback")}: ${track.fileName}`,
      playingStatus: `${ui(language, "playing")}: ${track.fileName}`
    });
  }

  async function checkLoopPlayback(track: TrackInfo): Promise<void> {
    if (!track.loop) {
      setStatus(ui(language, "setLoopBeforeCheck"));
      return;
    }
    if (playingTrackId === track.id && playbackKind === "loop-check") {
      stopPlayback(`${ui(language, "stoppedLoopCheck")}: ${track.fileName}`);
      return;
    }

    const preRollSamples = msToSample(settings.loopCheckPrerollMs, track.sampleRate);
    const offsetSample = Math.max(0, track.loop.endSample - preRollSamples);
    await startPlayback(track, {
      kind: "loop-check",
      offsetSample,
      loopStartSample: track.loop.startSample,
      loopEndSample: track.loop.endSample,
      loadingStatus: `${ui(language, "loadingLoopCheck")}: ${track.fileName}`,
      playingStatus: `${ui(language, "checkingLoop")}: ${track.fileName}`
    });
  }

  async function startPlayback(
    track: TrackInfo,
    options: {
      kind: PlaybackKind;
      offsetSample: number;
      loopStartSample?: number;
      loopEndSample?: number;
      loadingStatus: string;
      playingStatus: string;
    }
  ): Promise<void> {
    stopPlayback(ui(language, "preparingPlayback"));
    const requestId = ++playbackRequestRef.current;
    setStatus(options.loadingStatus);
    try {
      audioContext ??= new AudioContext();
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      const data = await window.autoLooper.readAudioFile(track.filePath);
      const buffer = await audioContext.decodeAudioData(data.slice(0));
      if (requestId !== playbackRequestRef.current) return;
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      if (options.loopStartSample !== undefined && options.loopEndSample !== undefined) {
        source.loop = true;
        source.loopStart = options.loopStartSample / track.sampleRate;
        source.loopEnd = options.loopEndSample / track.sampleRate;
      }
      source.connect(audioContext.destination);
      playbackRef.current = {
        source,
        trackId: track.id,
        kind: options.kind,
        sampleRate: track.sampleRate,
        durationSamples: track.durationSamples,
        startedAt: audioContext.currentTime,
        offsetSec: options.offsetSample / track.sampleRate,
        loopStartSec: options.loopStartSample === undefined ? undefined : options.loopStartSample / track.sampleRate,
        loopEndSec: options.loopEndSample === undefined ? undefined : options.loopEndSample / track.sampleRate,
        stoppedByUser: false
      };
      setPlayingTrackId(track.id);
      setPlaybackKind(options.kind);
      setPlayhead({ trackId: track.id, sample: options.offsetSample });
      source.onended = () => {
        const playback = playbackRef.current;
        if (playback?.source !== source) return;
        playbackRef.current = null;
        setPlayingTrackId(null);
        setPlaybackKind(null);
        setPlayhead(null);
        if (!playback.stoppedByUser) {
          setStatus(`${ui(language, "playbackEnded")}: ${track.fileName}`);
        }
      };
      source.start(0, options.offsetSample / track.sampleRate);
      setStatus(options.playingStatus);
    } catch (error) {
      if (requestId !== playbackRequestRef.current) return;
      playbackRef.current = null;
      setPlayingTrackId(null);
      setPlaybackKind(null);
      setPlayhead(null);
      setStatus(error instanceof Error ? `${ui(language, "playbackFailed")}: ${error.message}` : ui(language, "playbackFailed"));
    }
  }

  function patchLoopSample(track: TrackInfo, field: "startSample" | "endSample", value: number): void {
    const currentLoop = track.loop ?? {
      startSample: 0,
      endSample: Math.min(track.durationSamples, msToSample(settings.minimumLoopMs, track.sampleRate)),
      lengthSamples: 0,
      confidence: null,
      source: "manual" as const
    };
    const nextLoop = {
      ...currentLoop,
      [field]: clamp(Math.round(value), 0, track.durationSamples),
      source: "manual" as const,
      confidence: currentLoop.confidence
    };
    if (nextLoop.endSample < nextLoop.startSample) {
      if (field === "startSample") nextLoop.endSample = nextLoop.startSample;
      else nextLoop.startSample = nextLoop.endSample;
    }
    nextLoop.lengthSamples = nextLoop.endSample - nextLoop.startSample;
    const validation = validateLoop(track, nextLoop, settings);
    patchTrack(track.id, {
      loop: nextLoop,
      status: statusFromValidation(validation),
      validation
    });
  }

  function patchLoopLength(track: TrackInfo, value: number | null, invalidInput?: string): void {
    if (invalidInput !== undefined || value === null || !Number.isFinite(value)) {
      patchTrack(track.id, {
        status: "warning",
        validation: `Invalid loop length input: ${invalidInput ?? ""}`
      });
      return;
    }
    if (!track.loop) {
      patchTrack(track.id, {
        status: "warning",
        validation: "Loop length cannot be set before loop start is set."
      });
      return;
    }
    const lengthSamples = Math.round(value);
    if (lengthSamples <= 0) {
      patchTrack(track.id, {
        status: "warning",
        validation: "Loop length must be greater than zero."
      });
      return;
    }
    if (track.loop.startSample + lengthSamples > track.durationSamples) {
      patchTrack(track.id, {
        status: "warning",
        validation: "Loop length pushes loop end past audio duration."
      });
      return;
    }
    const nextLoop = {
      ...track.loop,
      endSample: track.loop.startSample + lengthSamples,
      lengthSamples,
      source: "manual" as const
    };
    const validation = validateLoop(track, nextLoop, settings);
    patchTrack(track.id, {
      loop: nextLoop,
      status: statusFromValidation(validation),
      validation
    });
  }

  function moveLoopRange(track: TrackInfo, startSample: number): void {
    if (!track.loop) return;
    const lengthSamples = track.loop.lengthSamples;
    const nextStart = clamp(Math.round(startSample), 0, Math.max(0, track.durationSamples - lengthSamples));
    const nextLoop = {
      ...track.loop,
      startSample: nextStart,
      endSample: nextStart + lengthSamples,
      lengthSamples,
      source: "manual" as const
    };
    const validation = validateLoop(track, nextLoop, settings);
    patchTrack(track.id, {
      loop: nextLoop,
      status: statusFromValidation(validation),
      validation
    });
  }

  function setTrackSelected(id: string, shouldSelect: boolean): void {
    setTrackContextMenu(null);
    if (shouldSelect) setActiveTrackId(id);
    setSelectedIds((current) => {
      const isSelected = current.includes(id);
      if (shouldSelect) return isSelected ? current : [...current, id];
      return isSelected ? current.filter((item) => item !== id) : current;
    });
  }

  function startSelectionDrag(id: string, isSelected: boolean): void {
    const shouldSelect = !isSelected;
    checkboxSelectionDragRef.current = { shouldSelect };
    setTrackSelected(id, shouldSelect);
  }

  function isSelectionIgnoredTarget(target: EventTarget): boolean {
    return target instanceof HTMLElement && Boolean(target.closest("input, button, select, textarea, a"));
  }

  function beginTrackSelection(id: string, isSelected: boolean, event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>): void {
    if (event.button !== 0) return;
    if (isSelectionIgnoredTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    startSelectionDrag(id, isSelected);
  }

  function beginCheckboxSelection(id: string, event: React.PointerEvent<HTMLInputElement>): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    startSelectionDrag(id, selectedIds.includes(id));
  }

  function continueTrackSelection(id: string, event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>): void {
    const drag = checkboxSelectionDragRef.current;
    if (!drag || (event.buttons & 1) !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    setTrackSelected(id, drag.shouldSelect);
  }

  function continueCheckboxSelection(id: string, event: React.PointerEvent<HTMLInputElement>): void {
    continueTrackSelection(id, event);
  }

  function openTrackContextMenu(track: TrackInfo, event: React.MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const targetIds = selectedIds.includes(track.id) ? selectedIds : [track.id];
    if (!selectedIds.includes(track.id)) {
      setSelectedIds([track.id]);
      setActiveTrackId(track.id);
    }
    setTrackContextMenu({ x: event.clientX, y: event.clientY, targetIds });
  }

  function handleDragEnter(event: React.DragEvent<HTMLElement>): void {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingFiles(true);
  }

  function handleDragOver(event: React.DragEvent<HTMLElement>): void {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: React.DragEvent<HTMLElement>): void {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDraggingFiles(false);
  }

  function handleDrop(event: React.DragEvent<HTMLElement>): void {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingFiles(false);
    setImportProgress({ total: event.dataTransfer.files.length, startedAtMs: Date.now() });
    setStatus(ui(language, "importingDropped"));
  }

  async function openReadme(): Promise<void> {
    setReadmeOpen(true);
    if (readmeContent || readmeError) return;
    try {
      setReadmeContent(await window.autoLooper.getReadme());
    } catch (error) {
      setReadmeError(error instanceof Error ? error.message : ui(language, "readmeFailed"));
    }
  }

  return (
    <main
      className={`app-shell${isDraggingFiles ? " dragging-files" : ""}`}
      onClick={() => setTrackContextMenu(null)}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="titlebar">
        <div className="brand">
          <span className="brand-mark">AL</span>
          <strong>AutoLooper</strong>
        </div>
        <div className="view-switch" role="tablist" aria-label="View mode">
          <button className={view === "waveform" ? "active" : ""} onClick={() => setView("waveform")}>
            <FileAudio size={16} /> {ui(language, "waveform")}
          </button>
          <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>
            <Table2 size={16} /> {ui(language, "listEditor")}
          </button>
        </div>
        <button className="display-unit-button" onClick={() => setDisplayUnit((current) => (current === "samples" ? "time" : "samples"))}>
          <Hash size={16} /> {displayUnit === "samples" ? ui(language, "displaySamples") : ui(language, "displayTime")}
        </button>
        <button className="readme-button" onClick={() => void openReadme()}>
          <BookOpen size={16} /> {ui(language, "readme")}
        </button>
        <button className="language-button" onClick={() => setLanguage((current) => (current === "ja" ? "en" : "ja"))}>
          <Languages size={17} /> {ui(language, "languageValue")}
        </button>
      </header>

      <section className="toolbar">
        <button onClick={importFiles} disabled={isDetecting || isImporting}>
          <FolderOpen size={19} /> {ui(language, "importFiles")}
        </button>
        <button className="primary-action" onClick={() => void detect(activeTracks)} disabled={activeTracks.length === 0 || isDetecting || isImporting}>
          {isDetecting ? <span className="spinner" /> : <Crosshair size={19} />} {isDetecting ? ui(language, "detectingNow") : ui(language, "autoLoop")}
        </button>
        <button onClick={() => void detect(tracks)} disabled={tracks.length === 0 || isDetecting || isImporting}>
          <Search size={19} /> {ui(language, "autoLoopAll")}
        </button>
        <button className="save" onClick={() => void saveLooped(activeTracks)} disabled={activeTracks.length === 0 || isDetecting || isImporting}>
          <Save size={19} /> {ui(language, "saveLoopedCopies")}
        </button>
        <button onClick={() => removeTracks(removableTrackIds)} disabled={removableTrackIds.length === 0 || isDetecting || isImporting}>
          <Trash2 size={18} /> {ui(language, "removeFromList")}
        </button>
        {detectionProgress && <DetectionProgressView progress={detectionProgress} language={language} onCancel={requestDetectionCancel} />}
        {importProgress && <ImportProgressView progress={importProgress} language={language} />}
        <div className="summary">
          <span><b>{tracks.length}</b> {ui(language, "files")}</span>
          <button
            type="button"
            className={issuePanel === "warnings" ? "active" : ""}
            onClick={() => setIssuePanel((current) => (current === "warnings" ? null : "warnings"))}
            disabled={counts.warnings === 0}
          >
            <b>{counts.warnings}</b> {ui(language, "warnings")}
          </button>
          <button
            type="button"
            className={issuePanel === "errors" ? "active" : ""}
            onClick={() => setIssuePanel((current) => (current === "errors" ? null : "errors"))}
            disabled={counts.errors === 0}
          >
            <b>{counts.errors}</b> {ui(language, "errors")}
          </button>
        </div>
      </section>

      {issuePanel && (
        <IssuePopover
          kind={issuePanel}
          tracks={issueTracks}
          language={language}
          onClose={() => setIssuePanel(null)}
          onSelectTrack={(track) => {
            setSelectedIds([track.id]);
            setActiveTrackId(track.id);
            setIssuePanel(null);
          }}
        />
      )}

      {readmeOpen && (
        <ReadmeModal
          content={readmeContent}
          error={readmeError}
          language={language}
          onClose={() => setReadmeOpen(false)}
        />
      )}

      {view === "waveform" ? (
        <WaveformView
          tracks={visibleTracks}
          selectedIds={selectedIds}
          selectedTrack={selectedTrack}
          settings={settings}
          setSettings={updateSettings}
          detectionPreset={detectionPreset}
          applyDetectionPreset={applyDetectionPreset}
          savedCustomSettings={savedCustomSettings}
          saveCustomPreset={saveCustomPreset}
          sortRules={sortRules}
          setSortRules={setSortRules}
          beginTrackSelection={beginTrackSelection}
          continueTrackSelection={continueTrackSelection}
          beginCheckboxSelection={beginCheckboxSelection}
          continueCheckboxSelection={continueCheckboxSelection}
          openTrackContextMenu={openTrackContextMenu}
          patchLoopSample={patchLoopSample}
          patchLoopLength={patchLoopLength}
          moveLoopRange={moveLoopRange}
          playingTrackId={playingTrackId}
          playbackKind={playbackKind}
          playhead={playhead}
          togglePlayback={togglePlayback}
          checkLoopPlayback={checkLoopPlayback}
          stopPlayback={stopPlayback}
          language={language}
          displayUnit={displayUnit}
        />
      ) : (
        <ListEditorView
          tracks={visibleTracks}
          allTracks={tracks}
          selectedIds={selectedIds}
          filter={filter}
          setFilter={setFilter}
          sortRules={sortRules}
          setSortRules={setSortRules}
          beginCheckboxSelection={beginCheckboxSelection}
          continueCheckboxSelection={continueCheckboxSelection}
          openTrackContextMenu={openTrackContextMenu}
          patchTrack={patchTrack}
          patchLoopSample={patchLoopSample}
          patchLoopLength={patchLoopLength}
          settings={settings}
          setSettings={updateSettings}
          detectionPreset={detectionPreset}
          applyDetectionPreset={applyDetectionPreset}
          savedCustomSettings={savedCustomSettings}
          saveCustomPreset={saveCustomPreset}
          language={language}
          displayUnit={displayUnit}
        />
      )}

      <footer className="statusbar">
        <span className="ready-dot" />
        <span>{status}</span>
        {selectedTrack && (
          <span className="track-stats">
            {ui(language, "sampleRate")}: {formatKhz(selectedTrack.sampleRate)} | {ui(language, "bitDepth")}: {selectedTrack.bitDepth ? `${selectedTrack.bitDepth}-bit` : ui(language, "compressed")} | {ui(language, "channels")}: {selectedTrack.channels}
          </span>
        )}
      </footer>
      {trackContextMenu && (
        <div
          className="context-menu"
          style={{ left: trackContextMenu.x, top: trackContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button onClick={() => removeTracks(trackContextMenu.targetIds)}>
            <Trash2 size={15} /> {ui(language, "removeFromList")}
          </button>
        </div>
      )}
    </main>
  );
}

interface RendererDetection {
  result: DetectionResult;
  trackPatch?: Partial<TrackInfo>;
}

function DetectionProgressView({
  progress,
  language,
  onCancel
}: {
  progress: DetectionProgress;
  language: Language;
  onCancel: () => void;
}): React.ReactElement {
  const [nowMs, setNowMs] = useState(Date.now());
  const pct = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;
  const elapsedSec = Math.max(0, (nowMs - progress.startedAtMs) / 1000);
  const requestCancel = (): void => {
    if (!progress.cancelRequested) onCancel();
  };

  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [progress.startedAtMs]);

  return (
    <div className={`detect-progress${progress.cancelRequested ? " cancel-requested" : ""}`} role="status" aria-label={ui(language, "detectionProgress")}>
      <span className="spinner" />
      <div>
        <strong>{progress.cancelRequested ? ui(language, "cancelingDetection") : ui(language, "detectingNow")} {progress.current}/{progress.total}</strong>
        <small>{progress.currentFile}</small>
        {progress.cancelRequested && <small className="cancel-detail">{ui(language, "cancelDetectionDetail")}</small>}
        <small className="progress-elapsed">{ui(language, "elapsedTime")} {formatElapsedSeconds(elapsedSec, language)}</small>
        <i><b style={{ width: `${clamp(pct, 0, 100)}%` }} /></i>
        <div className="progress-actions">
          <button
            type="button"
            className={`cancel-detection${progress.cancelRequested ? " cancel-pending" : ""}`}
            onPointerDown={(event) => {
              if (event.button === 0) requestCancel();
            }}
            onClick={(event) => {
              if (event.detail === 0) requestCancel();
            }}
            disabled={progress.cancelRequested}
            aria-live="polite"
          >
            {progress.cancelRequested ? ui(language, "cancelingDetection") : ui(language, "cancelDetection")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportProgressView({ progress, language }: { progress: ImportProgress; language: Language }): React.ReactElement {
  const [nowMs, setNowMs] = useState(Date.now());
  const elapsedSec = Math.max(0, (nowMs - progress.startedAtMs) / 1000);

  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [progress.startedAtMs]);

  return (
    <div className="detect-progress import-progress" role="status" aria-label={ui(language, "importProgress")}>
      <span className="spinner" />
      <div>
        <strong>{ui(language, "importProgress")}</strong>
        <small>{ui(language, "importProgressDetail")}{progress.total > 0 ? `: ${progress.total}` : ""}</small>
        <small className="progress-elapsed">{ui(language, "elapsedTime")} {formatElapsedSeconds(elapsedSec, language)}</small>
        <i><b /></i>
      </div>
    </div>
  );
}

function IssuePopover({
  kind,
  tracks,
  language,
  onClose,
  onSelectTrack
}: {
  kind: IssuePanelKind;
  tracks: TrackInfo[];
  language: Language;
  onClose: () => void;
  onSelectTrack: (track: TrackInfo) => void;
}): React.ReactElement {
  return (
    <section className="issue-popover panel" onClick={(event) => event.stopPropagation()}>
      <header>
        <strong>{ui(language, kind === "warnings" ? "warningDetails" : "errorDetails")}</strong>
        <button type="button" onClick={onClose}>{ui(language, "close")}</button>
      </header>
      {tracks.length === 0 ? (
        <p>{ui(language, "noIssueDetails")}</p>
      ) : (
        <div className="issue-list">
          {tracks.map((track) => (
            <button key={track.id} type="button" onClick={() => onSelectTrack(track)}>
              <span className="issue-file">{track.fileName}</span>
              <StatusPill status={track.status} language={language} />
              <span className="issue-validation">{displayValidation(track.validation, language)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ReadmeModal({
  content,
  error,
  language,
  onClose
}: {
  content: string | null;
  error: string | null;
  language: Language;
  onClose: () => void;
}): React.ReactElement {
  const section = content ? extractReadmeSection(content, language) : null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="readme-modal panel" onClick={(event) => event.stopPropagation()}>
        <header>
          <strong>{ui(language, "readmeTitle")}</strong>
          <button type="button" onClick={onClose}>{ui(language, "close")}</button>
        </header>
        <div className="readme-body">
          {error ? (
            <p className="error-text">{ui(language, "readmeFailed")} {error}</p>
          ) : section ? (
            renderMarkdown(section)
          ) : (
            <p>{ui(language, "readmeLoading")}</p>
          )}
        </div>
      </section>
    </div>
  );
}

function extractReadmeSection(content: string, language: Language): string {
  const normalized = content.replace(/\r\n/g, "\n");
  if (language === "ja") {
    const match = normalized.match(/## 日本語\n([\s\S]*?)\n---/);
    return match?.[1]?.trim() ?? normalized;
  }
  const match = normalized.match(/## English\n([\s\S]*)$/);
  return match?.[1]?.trim() ?? normalized;
}

function renderMarkdown(markdown: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  const lines = markdown.split("\n");
  let listItems: string[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];

  function flushList(key: string): void {
    if (listItems.length === 0) return;
    elements.push(
      <ul key={key}>
        {listItems.map((item, index) => <li key={`${key}-${index}`}>{renderInlineMarkdown(item)}</li>)}
      </ul>
    );
    listItems = [];
  }

  lines.forEach((line, index) => {
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(<pre key={`code-${index}`}><code>{codeLines.join("\n")}</code></pre>);
        inCodeBlock = false;
        codeLines = [];
      } else {
        flushList(`list-before-code-${index}`);
        inCodeBlock = true;
        codeLines = [];
      }
      return;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      return;
    }

    if (line.trim() === "") {
      flushList(`list-${index}`);
      return;
    }

    if (line.startsWith("### ")) {
      flushList(`list-before-h3-${index}`);
      elements.push(<h3 key={`h3-${index}`}>{renderInlineMarkdown(line.slice(4))}</h3>);
      return;
    }

    if (line.startsWith("## ")) {
      flushList(`list-before-h2-${index}`);
      elements.push(<h2 key={`h2-${index}`}>{renderInlineMarkdown(line.slice(3))}</h2>);
      return;
    }

    if (line.startsWith("# ")) {
      flushList(`list-before-h1-${index}`);
      elements.push(<h1 key={`h1-${index}`}>{renderInlineMarkdown(line.slice(2))}</h1>);
      return;
    }

    if (line.startsWith("- ")) {
      listItems.push(line.slice(2));
      return;
    }

    flushList(`list-before-p-${index}`);
    elements.push(<p key={`p-${index}`}>{renderInlineMarkdown(line)}</p>);
  });

  flushList("list-final");
  if (inCodeBlock) {
    elements.push(<pre key="code-final"><code>{codeLines.join("\n")}</code></pre>);
  }
  return elements;
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  return text.split(/(`[^`]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

let audioContext: AudioContext | null = null;

async function detectOggWithWebAudio(track: TrackInfo, settings: DetectionSettings): Promise<RendererDetection> {
  try {
    audioContext ??= new AudioContext();
    const data = await window.autoLooper.readAudioFile(track.filePath);
    const decoded = await audioContext.decodeAudioData(data.slice(0));
    const mono = downmixAudioBuffer(decoded);
    const candidate = findBestLoop(mono, decoded.sampleRate, settings, track.loop);
    const waveform = buildRendererWaveform(decoded);
    const patch: Partial<TrackInfo> = {
      sampleRate: decoded.sampleRate,
      channels: decoded.numberOfChannels,
      durationSamples: decoded.length,
      durationMs: decoded.duration * 1000,
      waveform
    };

    if (!candidate) {
      return {
        result: {
          id: track.id,
          loop: null,
          status: "no-loop",
          validation: `No loop candidate reached ${settings.matchThreshold}%.`
        },
        trackPatch: patch
      };
    }

    const loop = {
      startSample: candidate.start,
      endSample: candidate.end,
      lengthSamples: candidate.end - candidate.start,
      confidence: candidate.confidence,
      source: candidate.source
    };

    return {
      result: {
        id: track.id,
        loop,
        status: candidate.confidence >= settings.matchThreshold ? "detected" : "low-confidence",
        validation: `Detected at ${candidate.confidence.toFixed(1)}%.`
      },
      trackPatch: patch
    };
  } catch (error) {
    return {
      result: {
        id: track.id,
        loop: track.loop,
        status: "error",
        validation: error instanceof Error ? `Ogg decode failed: ${error.message}` : "Ogg decode failed."
      }
    };
  }
}

function downmixAudioBuffer(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < buffer.length; i += 1) {
      mono[i] += data[i] / buffer.numberOfChannels;
    }
  }
  return mono;
}

function buildRendererWaveform(buffer: AudioBuffer, targetPoints = 1400): WaveformPeaks {
  const resolution = Math.max(1, Math.ceil(buffer.length / targetPoints));
  const channels = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, channelIndex) => {
    const data = buffer.getChannelData(channelIndex);
    const min: number[] = [];
    const max: number[] = [];
    for (let i = 0; i < data.length; i += resolution) {
      let lo = 1;
      let hi = -1;
      const end = Math.min(data.length, i + resolution);
      for (let j = i; j < end; j += 1) {
        const value = data[j] ?? 0;
        if (value < lo) lo = value;
        if (value > hi) hi = value;
      }
      min.push(lo);
      max.push(hi);
    }
    return { min, max };
  });
  return { resolution, channels };
}

function WaveformView(props: {
  tracks: TrackInfo[];
  selectedIds: string[];
  selectedTrack: TrackInfo | null;
  settings: DetectionSettings;
  setSettings: (settings: DetectionSettings) => void;
  detectionPreset: DetectionPreset;
  applyDetectionPreset: (preset: DetectionPreset) => void;
  savedCustomSettings: DetectionSettings | null;
  saveCustomPreset: () => void;
  sortRules: SortRule[];
  setSortRules: (rules: SortRule[]) => void;
  beginTrackSelection: (id: string, isSelected: boolean, event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => void;
  continueTrackSelection: (id: string, event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => void;
  beginCheckboxSelection: (id: string, event: React.PointerEvent<HTMLInputElement>) => void;
  continueCheckboxSelection: (id: string, event: React.PointerEvent<HTMLInputElement>) => void;
  openTrackContextMenu: (track: TrackInfo, event: React.MouseEvent) => void;
  patchLoopSample: (track: TrackInfo, field: "startSample" | "endSample", value: number) => void;
  patchLoopLength: (track: TrackInfo, value: number | null, invalidInput?: string) => void;
  moveLoopRange: (track: TrackInfo, startSample: number) => void;
  playingTrackId: string | null;
  playbackKind: PlaybackKind | null;
  playhead: { trackId: string; sample: number } | null;
  togglePlayback: (track: TrackInfo) => Promise<void>;
  checkLoopPlayback: (track: TrackInfo) => Promise<void>;
  stopPlayback: () => void;
  language: Language;
  displayUnit: DisplayUnit;
}): React.ReactElement {
  const {
    tracks,
    selectedIds,
    selectedTrack,
    settings,
    setSettings,
    detectionPreset,
    applyDetectionPreset,
    savedCustomSettings,
    saveCustomPreset,
    sortRules,
    setSortRules,
    beginTrackSelection,
    continueTrackSelection,
    beginCheckboxSelection,
    continueCheckboxSelection,
    openTrackContextMenu,
    patchLoopSample,
    patchLoopLength,
    moveLoopRange,
    playingTrackId,
    playbackKind,
    playhead,
    togglePlayback,
    checkLoopPlayback,
    stopPlayback,
    language,
    displayUnit
  } = props;
  const isTrackPlaying = selectedTrack !== null && playingTrackId === selectedTrack.id && playbackKind === "track";
  const isLoopChecking = selectedTrack !== null && playingTrackId === selectedTrack.id && playbackKind === "loop-check";
  return (
    <section className="workspace waveform-mode">
      <div className="batch-grid panel">
        <TrackTable
          tracks={tracks}
          selectedIds={selectedIds}
          sortRules={sortRules}
          setSortRules={setSortRules}
          beginTrackSelection={beginTrackSelection}
          continueTrackSelection={continueTrackSelection}
          beginCheckboxSelection={beginCheckboxSelection}
          continueCheckboxSelection={continueCheckboxSelection}
          openTrackContextMenu={openTrackContextMenu}
          language={language}
          displayUnit={displayUnit}
        />
      </div>
      <div className="waveform-panel panel">
        {selectedTrack ? (
          <>
            <div className="waveform-header">
              <div>
                <strong>{selectedTrack.fileName}</strong>
                <span>{formatKhz(selectedTrack.sampleRate)}</span>
                <span>{selectedTrack.bitDepth ? `${selectedTrack.bitDepth}-bit` : ui(language, "compressed")}</span>
                <span>{formatTrackDuration(selectedTrack, displayUnit)}</span>
              </div>
            </div>
            <WaveformCanvas
              track={selectedTrack}
              playheadSample={playhead?.trackId === selectedTrack.id ? playhead.sample : null}
              moveLoopRange={moveLoopRange}
              language={language}
              displayUnit={displayUnit}
            />
            <div className="transport">
              <button onClick={() => void togglePlayback(selectedTrack)} aria-label={isTrackPlaying ? "Stop playback" : "Play track"}>
                {isTrackPlaying ? <Square size={15} /> : <Play size={18} />} {isTrackPlaying ? ui(language, "stop") : ui(language, "play")}
              </button>
              <button onClick={() => void checkLoopPlayback(selectedTrack)} disabled={!selectedTrack.loop} aria-label="Check loop transition">
                {isLoopChecking ? <Square size={15} /> : <Repeat size={18} />} {isLoopChecking ? ui(language, "stopCheck") : ui(language, "checkLoop")}
              </button>
              <button>&lt;&lt;</button>
              <button>&gt;&gt;</button>
              <span>{selectedTrack.loop ? formatSamplePosition(selectedTrack.loop.startSample, selectedTrack.sampleRate, displayUnit) : emptyPosition(displayUnit)} / {formatTrackDuration(selectedTrack, displayUnit)}</span>
            </div>
          </>
        ) : (
          <div className="empty-state"><Upload size={34} /> {ui(language, "emptyImport")}</div>
        )}
      </div>
      <aside className="inspector panel">
        <SettingsPanel
          settings={settings}
          setSettings={setSettings}
          detectionPreset={detectionPreset}
          applyDetectionPreset={applyDetectionPreset}
          savedCustomSettings={savedCustomSettings}
          saveCustomPreset={saveCustomPreset}
          language={language}
        />
        {selectedTrack && (
          <LoopPanel track={selectedTrack} patchLoopSample={patchLoopSample} patchLoopLength={patchLoopLength} language={language} displayUnit={displayUnit} />
        )}
      </aside>
    </section>
  );
}

function TrackTable(props: {
  tracks: TrackInfo[];
  selectedIds: string[];
  sortRules: SortRule[];
  setSortRules: (rules: SortRule[]) => void;
  beginTrackSelection: (id: string, isSelected: boolean, event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => void;
  continueTrackSelection: (id: string, event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => void;
  beginCheckboxSelection: (id: string, event: React.PointerEvent<HTMLInputElement>) => void;
  continueCheckboxSelection: (id: string, event: React.PointerEvent<HTMLInputElement>) => void;
  openTrackContextMenu: (track: TrackInfo, event: React.MouseEvent) => void;
  language: Language;
  displayUnit: DisplayUnit;
}): React.ReactElement {
  const columns: Array<[SortRule["key"], string]> = [
    ["fileName", ui(props.language, "file")],
    ["format", ui(props.language, "format")],
    ["confidence", ui(props.language, "confidence")],
    ["loopStart", ui(props.language, "loopStart")],
    ["loopEnd", ui(props.language, "loopEnd")],
    ["loopLength", ui(props.language, "loopLength")],
    ["durationMs", props.displayUnit === "samples" ? ui(props.language, "durationSamples") : ui(props.language, "duration")]
  ];
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th className="check-cell" />
          {columns.map(([key, label]) => (
            <th key={key} onClick={(event) => props.setSortRules(nextSortRules(props.sortRules, key, event.shiftKey))}>
              {label} <SortIndicator rules={props.sortRules} column={key} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.tracks.map((track) => (
          <tr
            key={track.id}
            className={props.selectedIds.includes(track.id) ? "selected" : ""}
            onPointerDown={(event) => props.beginTrackSelection(track.id, props.selectedIds.includes(track.id), event)}
            onPointerEnter={(event) => props.continueTrackSelection(track.id, event)}
            onContextMenu={(event) => props.openTrackContextMenu(track, event)}
          >
            <td className="check-cell">
              <input
                type="checkbox"
                checked={props.selectedIds.includes(track.id)}
                readOnly
                onPointerDown={(event) => props.beginCheckboxSelection(track.id, event)}
                onPointerEnter={(event) => props.continueCheckboxSelection(track.id, event)}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              />
            </td>
            <td><FileAudio size={15} /> {track.fileName}</td>
            <td><FormatCell track={track} /></td>
            <td><ConfidenceBar value={track.loop?.confidence ?? null} /></td>
            <td>{track.loop ? formatSamplePosition(track.loop.startSample, track.sampleRate, props.displayUnit) : "-"}</td>
            <td>{track.loop ? formatSamplePosition(track.loop.endSample, track.sampleRate, props.displayUnit) : "-"}</td>
            <td>{track.loop ? formatSamplePosition(track.loop.lengthSamples, track.sampleRate, props.displayUnit) : "-"}</td>
            <td>{formatTrackDuration(track, props.displayUnit)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function WaveformCanvas({
  track,
  playheadSample,
  moveLoopRange,
  language,
  displayUnit
}: {
  track: TrackInfo;
  playheadSample: number | null;
  moveLoopRange: (track: TrackInfo, startSample: number) => void;
  language: Language;
  displayUnit: DisplayUnit;
}): React.ReactElement {
  const width = 1200;
  const height = 300;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const scanGradientId = useId().replace(/:/g, "");
  const [drag, setDrag] = useState<{ pointerId: number; pointerSample: number; startSample: number } | null>(null);
  const durationSamples = Math.max(1, track.durationSamples);
  const channels = track.waveform?.channels.slice(0, 2) ?? [];
  const points = channels[0]?.min.length ?? 0;
  const startX = track.loop ? (track.loop.startSample / durationSamples) * width : null;
  const endX = track.loop ? (track.loop.endSample / durationSamples) * width : null;
  const playheadX = playheadSample === null ? null : (playheadSample / durationSamples) * width;
  const isScanning = track.status === "processing";

  function sampleFromClientX(clientX: number): number {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return 0;
    const x = clamp(((clientX - bounds.left) / bounds.width) * width, 0, width);
    return Math.round((x / width) * durationSamples);
  }

  function sampleFromPointer(event: React.PointerEvent<SVGElement>): number {
    return sampleFromClientX(event.clientX);
  }

  function sampleFromMouse(event: React.MouseEvent<SVGElement>): number {
    return sampleFromClientX(event.clientX);
  }

  function handleLoopPointerDown(event: React.PointerEvent<SVGRectElement>): void {
    if (!track.loop) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      pointerId: event.pointerId,
      pointerSample: sampleFromPointer(event),
      startSample: track.loop.startSample
    });
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>): void {
    if (!drag || !track.loop) return;
    if (drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const deltaSamples = sampleFromPointer(event) - drag.pointerSample;
    moveLoopRange(track, drag.startSample + deltaSamples);
  }

  function handlePointerUp(event: React.PointerEvent<SVGSVGElement>): void {
    if (drag?.pointerId !== event.pointerId) return;
    setDrag(null);
  }

  function handleLoopMouseDown(event: React.MouseEvent<SVGRectElement>): void {
    if (!track.loop) return;
    event.preventDefault();
    setDrag({
      pointerId: -1,
      pointerSample: sampleFromMouse(event),
      startSample: track.loop.startSample
    });
  }

  function handleMouseMove(event: React.MouseEvent<SVGSVGElement>): void {
    if (!drag || drag.pointerId !== -1 || !track.loop) return;
    event.preventDefault();
    const deltaSamples = sampleFromMouse(event) - drag.pointerSample;
    moveLoopRange(track, drag.startSample + deltaSamples);
  }

  function handleMouseUp(): void {
    if (drag?.pointerId !== -1) return;
    setDrag(null);
  }

  return (
    <svg
      ref={svgRef}
      className={`waveform-svg${drag ? " dragging-loop" : ""}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${track.fileName} waveform`}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <defs>
        <linearGradient id={scanGradientId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#2bd7e9" stopOpacity="0" />
          <stop offset="48%" stopColor="#2bd7e9" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#5ad46b" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width={width} height={height} rx="8" className="waveform-bg" />
      {[0, 1].map((channelIndex) => {
        const channel = channels[channelIndex];
        const yBase = channelIndex === 0 ? 86 : 214;
        if (!channel) {
          return <line key={channelIndex} x1="20" x2={width - 20} y1={yBase} y2={yBase} className="wave-mid" />;
        }
        const path = buildWavePath(channel.min, channel.max, width, yBase, 58);
        return <path key={channelIndex} d={path} className="wave-path" />;
      })}
      <text x="20" y="90" className="channel-label">L</text>
      <text x="20" y="218" className="channel-label">R</text>
      {startX !== null && endX !== null && (
        <>
          <rect
            x={startX}
            y="32"
            width={Math.max(1, endX - startX)}
            height="236"
            className="loop-range"
            onPointerDown={handleLoopPointerDown}
            onMouseDown={handleLoopMouseDown}
          />
          <line x1={startX} x2={startX} y1="24" y2="278" className="loop-start" />
          <line x1={endX} x2={endX} y1="24" y2="278" className="loop-end" />
          <text x={startX + 6} y="24" className="marker-label start">{formatSamplePosition(track.loop!.startSample, track.sampleRate, displayUnit)}</text>
          <text x={Math.max(8, endX - 112)} y="24" className="marker-label end">{formatSamplePosition(track.loop!.endSample, track.sampleRate, displayUnit)}</text>
          <text x={(startX + endX) / 2 - 82} y="154" className="length-label">{ui(language, "loopLength")}: {formatSamplePosition(track.loop!.lengthSamples, track.sampleRate, displayUnit)}</text>
        </>
      )}
      {playheadX !== null && (
        <>
          <line x1={playheadX} x2={playheadX} y1="18" y2="286" className="playhead-line" />
          <text x={Math.min(width - 108, playheadX + 8)} y="286" className="playhead-label">{formatSamplePosition(playheadSample ?? 0, track.sampleRate, displayUnit)}</text>
        </>
      )}
      {points === 0 && <text x="430" y="154" className="empty-wave">Waveform preview unavailable</text>}
      {isScanning && (
        <g className="waveform-scanning" aria-label={ui(language, "scanningWaveform")}>
          <rect width={width} height={height} rx="8" className="scan-tint" />
          <rect x="-420" y="0" width="420" height={height} className="scan-sweep" fill={`url(#${scanGradientId})`} />
          <text x={width / 2} y={height / 2 + 8} textAnchor="middle" className="scan-label">{ui(language, "scanningWaveform")}</text>
        </g>
      )}
    </svg>
  );
}

function SettingsPanel({
  settings,
  setSettings,
  detectionPreset,
  applyDetectionPreset,
  savedCustomSettings,
  saveCustomPreset,
  language
}: {
  settings: DetectionSettings;
  setSettings: (settings: DetectionSettings) => void;
  detectionPreset: DetectionPreset;
  applyDetectionPreset: (preset: DetectionPreset) => void;
  savedCustomSettings: DetectionSettings | null;
  saveCustomPreset: () => void;
  language: Language;
}): React.ReactElement {
  const presetHelp =
    detectionPreset === "high"
      ? ui(language, "highPresetHelp")
      : detectionPreset === "mid"
        ? ui(language, "midPresetHelp")
        : detectionPreset === "low"
          ? ui(language, "lowPresetHelp")
          : savedCustomSettings
            ? ui(language, "customPresetHelp")
            : ui(language, "customPresetEmptyHelp");

  return (
    <section className="inspector-section settings-section">
      <h2>{ui(language, "autoLoopSettings")}</h2>
      <div className="preset-row">
        <span>
          <strong>{ui(language, "detectionPreset")}</strong>
          <small>{presetHelp}</small>
        </span>
        <div className="preset-buttons">
          <button className={detectionPreset === "high" ? "active" : ""} onClick={() => applyDetectionPreset("high")}>{ui(language, "highPreset")}</button>
          <button className={detectionPreset === "mid" ? "active" : ""} onClick={() => applyDetectionPreset("mid")}>{ui(language, "midPreset")}</button>
          <button className={detectionPreset === "low" ? "active" : ""} onClick={() => applyDetectionPreset("low")}>{ui(language, "lowPreset")}</button>
          <button className={detectionPreset === "custom" ? "active" : ""} onClick={() => applyDetectionPreset("custom")} disabled={!savedCustomSettings}>{ui(language, "customPreset")}</button>
          <button className="save-custom-preset" onClick={saveCustomPreset}>{ui(language, "saveCustomPreset")}</button>
        </div>
      </div>
      <label className="setting-field">
        <span>
          <strong>{ui(language, "matchWindow")}</strong>
          <small>{ui(language, "matchWindowHelp")}</small>
        </span>
        <input type="number" value={settings.matchWindowMs} onChange={(event) => setSettings({ ...settings, matchWindowMs: Number(event.target.value) })} />
        <em>ms</em>
      </label>
      <label className="setting-field">
        <span>
          <strong>{ui(language, "requiredMatch")}</strong>
          <small>{ui(language, "requiredMatchHelp")}</small>
        </span>
        <input type="number" value={settings.matchThreshold} onChange={(event) => setSettings({ ...settings, matchThreshold: Number(event.target.value) })} />
        <em>%</em>
      </label>
      <label className="setting-field">
        <span>
          <strong>{ui(language, "minimumLoop")}</strong>
          <small>{ui(language, "minimumLoopHelp")}</small>
        </span>
        <input type="number" value={settings.minimumLoopMs} onChange={(event) => setSettings({ ...settings, minimumLoopMs: Number(event.target.value) })} />
        <em>ms</em>
      </label>
      <label className="setting-field">
        <span>
          <strong>{ui(language, "loopCheckPreroll")}</strong>
          <small>{ui(language, "loopCheckPrerollHelp")}</small>
        </span>
        <input type="number" value={settings.loopCheckPrerollMs} onChange={(event) => setSettings({ ...settings, loopCheckPrerollMs: Number(event.target.value) })} />
        <em>ms</em>
      </label>
    </section>
  );
}

function LoopPanel({
  track,
  patchLoopSample,
  patchLoopLength,
  language,
  displayUnit
}: {
  track: TrackInfo;
  patchLoopSample: (track: TrackInfo, field: "startSample" | "endSample", value: number) => void;
  patchLoopLength: (track: TrackInfo, value: number | null, invalidInput?: string) => void;
  language: Language;
  displayUnit: DisplayUnit;
}): React.ReactElement {
  return (
    <section className="inspector-section">
      <h2>{ui(language, "loopPoints")}</h2>
      <label>
        <span>{ui(language, "loopStart")}</span>
        <input type="number" value={track.loop?.startSample ?? 0} onChange={(event) => patchLoopSample(track, "startSample", Number(event.target.value))} />
      </label>
      <label>
        <span>{ui(language, "loopEnd")}</span>
        <input type="number" value={track.loop?.endSample ?? 0} onChange={(event) => patchLoopSample(track, "endSample", Number(event.target.value))} />
      </label>
      <label>
        <span>{ui(language, "loopLength")}</span>
        <EditablePosition
          value={track.loop?.lengthSamples ?? 0}
          sampleRate={track.sampleRate}
          displayUnit={displayUnit}
          onCommit={(value) => patchLoopLength(track, value)}
          onInvalid={(input) => patchLoopLength(track, null, input)}
        />
      </label>
      <div className="readout">
        <span>{ui(language, "confidence")}</span>
        <strong>{formatPercent(track.loop?.confidence)}</strong>
      </div>
      <p className="validation">{displayValidation(track.validation, language)}</p>
    </section>
  );
}

function ListEditorView(props: {
  tracks: TrackInfo[];
  allTracks: TrackInfo[];
  selectedIds: string[];
  filter: string;
  setFilter: (value: string) => void;
  sortRules: SortRule[];
  setSortRules: (rules: SortRule[]) => void;
  beginCheckboxSelection: (id: string, event: React.PointerEvent<HTMLInputElement>) => void;
  continueCheckboxSelection: (id: string, event: React.PointerEvent<HTMLInputElement>) => void;
  openTrackContextMenu: (track: TrackInfo, event: React.MouseEvent) => void;
  patchTrack: (id: string, patch: Partial<TrackInfo>) => void;
  patchLoopSample: (track: TrackInfo, field: "startSample" | "endSample", value: number) => void;
  patchLoopLength: (track: TrackInfo, value: number | null, invalidInput?: string) => void;
  settings: DetectionSettings;
  setSettings: (settings: DetectionSettings) => void;
  detectionPreset: DetectionPreset;
  applyDetectionPreset: (preset: DetectionPreset) => void;
  savedCustomSettings: DetectionSettings | null;
  saveCustomPreset: () => void;
  language: Language;
  displayUnit: DisplayUnit;
}): React.ReactElement {
  const [statusFilter, setStatusFilter] = useState<TrackStatus | "all">("all");
  const [columnOrder, setColumnOrder] = useState<ListColumnKey[]>(listColumns.map((column) => column.key));
  const [draggedColumn, setDraggedColumn] = useState<ListColumnKey | null>(null);
  const [dropTargetColumn, setDropTargetColumn] = useState<ListColumnKey | null>(null);
  const [cellSelection, setCellSelection] = useState<CellSelection | null>(null);
  const isSelectingCellsRef = useRef(false);
  const lastColumnDragAtRef = useRef(0);
  const visible = props.tracks.filter((track) => statusFilter === "all" || track.status === statusFilter);
  const orderedColumns = columnOrder
    .map((key) => listColumns.find((column) => column.key === key))
    .filter((column): column is ListColumn => Boolean(column));

  function selectedRangeTsv(): string {
    return cellSelection ? cellSelectionToTsv(cellSelection, visible, orderedColumns, props.displayUnit) : "";
  }

  function copySelected(): void {
    if (cellSelection) {
      void navigator.clipboard.writeText(selectedRangeTsv());
      return;
    }
    const rows = (props.selectedIds.length ? props.allTracks.filter((track) => props.selectedIds.includes(track.id)) : visible).map(trackToTsvRow);
    void navigator.clipboard.writeText([tsvHeader.join("\t"), ...rows.map((row) => row.join("\t"))].join("\n"));
  }

  async function pasteTable(): Promise<void> {
    const text = await navigator.clipboard.readText();
    pasteText(text);
  }

  function pasteText(text: string): void {
    if (cellSelection) {
      applyCellRangeTsv(text, cellSelection, visible, orderedColumns, props.displayUnit, props.patchTrack, props.settings);
      return;
    }
    applyTsv(text, props.allTracks, props.displayUnit, props.patchLoopSample, props.patchLoopLength);
  }

  function moveColumn(source: ListColumnKey, target: ListColumnKey): void {
    if (source === target) return;
    setColumnOrder((current) => {
      const next = current.filter((key) => key !== source);
      const targetIndex = next.indexOf(target);
      if (targetIndex < 0) return current;
      next.splice(targetIndex, 0, source);
      return next;
    });
  }

  function handleHeaderClick(event: React.MouseEvent<HTMLTableCellElement>, column: ListColumn): void {
    if (Date.now() - lastColumnDragAtRef.current < 300) return;
    props.setSortRules(nextSortRules(props.sortRules, column.sortKey, event.shiftKey));
  }

  function handleHeaderDragStart(event: React.DragEvent<HTMLTableCellElement>, column: ListColumn): void {
    setDraggedColumn(column.key);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", column.key);
  }

  function handleHeaderDragOver(event: React.DragEvent<HTMLTableCellElement>, column: ListColumn): void {
    if (!draggedColumn || draggedColumn === column.key) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetColumn(column.key);
  }

  function handleHeaderDrop(event: React.DragEvent<HTMLTableCellElement>, column: ListColumn): void {
    event.preventDefault();
    const source = (event.dataTransfer.getData("text/plain") || draggedColumn) as ListColumnKey | null;
    if (source && listColumns.some((item) => item.key === source)) {
      moveColumn(source, column.key);
    }
    lastColumnDragAtRef.current = Date.now();
    setDraggedColumn(null);
    setDropTargetColumn(null);
  }

  function handleHeaderDragEnd(): void {
    lastColumnDragAtRef.current = Date.now();
    setDraggedColumn(null);
    setDropTargetColumn(null);
  }

  useEffect(() => {
    const stopSelecting = () => {
      isSelectingCellsRef.current = false;
    };
    window.addEventListener("mouseup", stopSelecting);
    return () => window.removeEventListener("mouseup", stopSelecting);
  }, []);

  useEffect(() => {
    const handleCopy = (event: ClipboardEvent) => {
      if (!cellSelection) return;
      const text = selectedRangeTsv();
      if (!text) return;
      event.preventDefault();
      if (event.clipboardData) {
        event.clipboardData.setData("text/plain", text);
        return;
      }
      void navigator.clipboard.writeText(text);
    };
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (!cellSelection && target instanceof HTMLElement && (target.closest("input, textarea, select") || target.isContentEditable)) return;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!text) return;
      event.preventDefault();
      pasteText(text);
    };
    document.addEventListener("copy", handleCopy);
    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("paste", handlePaste);
    };
  }, [cellSelection, visible, orderedColumns, props.displayUnit, props.allTracks, props.patchLoopSample, props.patchLoopLength, props.patchTrack, props.settings]);

  function isSelectableColumnIndex(colIndex: number): boolean {
    const column = orderedColumns[colIndex];
    return Boolean(column && isSelectableListColumn(column.key));
  }

  function handleListMouseDownCapture(event: React.MouseEvent<HTMLElement>): void {
    if (!cellSelection || event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest(".list-editor td:not(.check-cell)") || target.closest(".selection-preserving-action")) return;
    isSelectingCellsRef.current = false;
    setCellSelection(null);
  }

  function handleCellMouseDown(event: React.MouseEvent<HTMLTableCellElement>, rowIndex: number, colIndex: number): void {
    if (event.button !== 0) return;
    if (!isSelectableColumnIndex(colIndex)) {
      setCellSelection(null);
      isSelectingCellsRef.current = false;
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button, select, textarea, a")) return;
    if (target instanceof HTMLElement && target.closest("input:not(.cell-input)")) return;
    if (!(target instanceof HTMLElement && target.closest(".cell-input"))) {
      event.preventDefault();
    }
    event.stopPropagation();
    setCellSelection({ anchorRow: rowIndex, anchorCol: colIndex, focusRow: rowIndex, focusCol: colIndex });
    isSelectingCellsRef.current = true;
  }

  function handleCellMouseEnter(event: React.MouseEvent<HTMLTableCellElement>, rowIndex: number, colIndex: number): void {
    if (!isSelectingCellsRef.current) return;
    if (!isSelectableColumnIndex(colIndex)) return;
    event.preventDefault();
    event.stopPropagation();
    setCellSelection((current) => current ? { ...current, focusRow: rowIndex, focusCol: colIndex } : current);
  }

  function isCellSelected(rowIndex: number, colIndex: number): boolean {
    if (!cellSelection) return false;
    if (!isSelectableColumnIndex(colIndex)) return false;
    const range = normalizeCellSelection(cellSelection, visible.length, orderedColumns.length);
    return rowIndex >= range.minRow && rowIndex <= range.maxRow && colIndex >= range.minCol && colIndex <= range.maxCol;
  }

  function renderListCell(track: TrackInfo, columnKey: ListColumnKey): React.ReactNode {
    switch (columnKey) {
      case "fileName":
        return track.fileName;
      case "format":
        return <FormatCell track={track} />;
      case "sampleRate":
        return track.sampleRate;
      case "bitDepth":
        return track.bitDepth ?? "Vorbis";
      case "durationSamples":
        return formatTrackDuration(track, props.displayUnit);
      case "loopStart":
        return <EditablePosition value={track.loop?.startSample ?? 0} sampleRate={track.sampleRate} displayUnit={props.displayUnit} onCommit={(value) => props.patchLoopSample(track, "startSample", value)} />;
      case "loopEnd":
        return <EditablePosition value={track.loop?.endSample ?? 0} sampleRate={track.sampleRate} displayUnit={props.displayUnit} onCommit={(value) => props.patchLoopSample(track, "endSample", value)} />;
      case "loopLength":
        return (
          <EditablePosition
            value={track.loop?.lengthSamples ?? 0}
            sampleRate={track.sampleRate}
            displayUnit={props.displayUnit}
            onCommit={(value) => props.patchLoopLength(track, value)}
            onInvalid={(input) => props.patchLoopLength(track, null, input)}
          />
        );
      case "confidence":
        return formatPercent(track.loop?.confidence);
      case "validation":
        return displayValidation(track.validation, props.language);
      case "outputPath":
        return track.outputPath;
    }
  }

  return (
    <section className="workspace list-mode" onMouseDownCapture={handleListMouseDownCapture}>
      <div className="list-toolbar panel">
        <div className="searchbox">
          <Search size={16} />
          <input value={props.filter} onChange={(event) => props.setFilter(event.target.value)} placeholder={ui(props.language, "filterPlaceholder")} />
        </div>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as TrackStatus | "all")}>
          <option value="all">{ui(props.language, "allStatuses")}</option>
          <option value="pending">{ui(props.language, "pending")}</option>
          <option value="processing">{ui(props.language, "processing")}</option>
          <option value="detected">{ui(props.language, "detected")}</option>
          <option value="low-confidence">{ui(props.language, "lowConfidence")}</option>
          <option value="no-loop">{ui(props.language, "noLoopFound")}</option>
          <option value="edited">{ui(props.language, "edited")}</option>
          <option value="warning">{ui(props.language, "warningStatus")}</option>
          <option value="canceled">{ui(props.language, "canceled")}</option>
          <option value="saved">{ui(props.language, "saved")}</option>
          <option value="error">{ui(props.language, "error")}</option>
        </select>
        <button className="selection-preserving-action" onClick={pasteTable}><Upload size={16} /> {ui(props.language, "pasteTable")}</button>
        <button className="selection-preserving-action" onClick={copySelected}><Copy size={16} /> {ui(props.language, cellSelection ? "copyRange" : "copySelected")}</button>
      </div>
      <div className="list-grid panel">
        <table className="data-table list-editor">
          <thead>
            <tr>
              <th className="check-cell" />
              {orderedColumns.map((column) => (
                <th
                  key={column.key}
                  draggable
                  className={[
                    "draggable-column",
                    draggedColumn === column.key ? "dragging-column" : "",
                    dropTargetColumn === column.key ? "drop-target-column" : ""
                  ].filter(Boolean).join(" ")}
                  onClick={(event) => handleHeaderClick(event, column)}
                  onDragStart={(event) => handleHeaderDragStart(event, column)}
                  onDragOver={(event) => handleHeaderDragOver(event, column)}
                  onDragLeave={() => setDropTargetColumn((current) => (current === column.key ? null : current))}
                  onDrop={(event) => handleHeaderDrop(event, column)}
                  onDragEnd={handleHeaderDragEnd}
                >
                  {listColumnLabel(column, props.displayUnit, props.language)} <SortIndicator rules={props.sortRules} column={column.sortKey} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((track, rowIndex) => (
              <tr
                key={track.id}
                className={props.selectedIds.includes(track.id) ? "selected" : ""}
                onContextMenu={(event) => props.openTrackContextMenu(track, event)}
              >
                <td className="check-cell">
                  <input
                    type="checkbox"
                    checked={props.selectedIds.includes(track.id)}
                    readOnly
                    onPointerDown={(event) => props.beginCheckboxSelection(track.id, event)}
                    onPointerEnter={(event) => props.continueCheckboxSelection(track.id, event)}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  />
                </td>
                {orderedColumns.map((column, colIndex) => (
                  <td
                    key={column.key}
                    className={[
                      column.key === "validation" && track.status === "error" ? "error-text" : "",
                      !isSelectableListColumn(column.key) ? "cell-unselectable" : "",
                      isCellSelected(rowIndex, colIndex) ? "cell-selected" : "",
                      cellSelection?.anchorRow === rowIndex && cellSelection.anchorCol === colIndex ? "selection-anchor" : ""
                    ].filter(Boolean).join(" ")}
                    onMouseDown={(event) => handleCellMouseDown(event, rowIndex, colIndex)}
                    onMouseOver={(event) => handleCellMouseEnter(event, rowIndex, colIndex)}
                  >
                    {renderListCell(track, column.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <aside className="clipboard-panel panel">
        <SettingsPanel
          settings={props.settings}
          setSettings={props.setSettings}
          detectionPreset={props.detectionPreset}
          applyDetectionPreset={props.applyDetectionPreset}
          savedCustomSettings={props.savedCustomSettings}
          saveCustomPreset={props.saveCustomPreset}
          language={props.language}
        />
      </aside>
    </section>
  );
}

type ListColumnKey =
  | "fileName"
  | "format"
  | "sampleRate"
  | "bitDepth"
  | "durationSamples"
  | "loopStart"
  | "loopEnd"
  | "loopLength"
  | "confidence"
  | "validation"
  | "outputPath";

interface ListColumn {
  key: ListColumnKey;
  labelKey: UiKey;
  sortKey: SortRule["key"];
}

const listColumns: ListColumn[] = [
  { key: "fileName", labelKey: "file", sortKey: "fileName" },
  { key: "format", labelKey: "format", sortKey: "format" },
  { key: "sampleRate", labelKey: "sampleRate", sortKey: "sampleRate" },
  { key: "bitDepth", labelKey: "bitDepth", sortKey: "bitDepth" },
  { key: "durationSamples", labelKey: "durationSamples", sortKey: "durationSamples" },
  { key: "loopStart", labelKey: "loopStartSample", sortKey: "loopStart" },
  { key: "loopEnd", labelKey: "loopEndSample", sortKey: "loopEnd" },
  { key: "loopLength", labelKey: "loopLength", sortKey: "loopLength" },
  { key: "confidence", labelKey: "confidence", sortKey: "confidence" },
  { key: "validation", labelKey: "validation", sortKey: "validation" },
  { key: "outputPath", labelKey: "outputName", sortKey: "outputPath" }
];

function listColumnLabel(column: ListColumn, displayUnit: DisplayUnit, language: Language): string {
  if (displayUnit === "time") {
    if (column.key === "durationSamples") return ui(language, "duration");
    if (column.key === "loopStart") return ui(language, "loopStart");
    if (column.key === "loopEnd") return ui(language, "loopEnd");
  }
  return ui(language, column.labelKey);
}

const tsvHeader = ["File", "Loop Start Sample", "Loop End Sample", "Loop Length", "Confidence", "Output Name"];

function trackToTsvRow(track: TrackInfo): string[] {
  return [
    track.fileName,
    String(track.loop?.startSample ?? ""),
    String(track.loop?.endSample ?? ""),
    String(track.loop?.lengthSamples ?? ""),
    track.loop?.confidence?.toFixed(1) ?? "",
    track.outputPath
  ];
}

function normalizeCellSelection(selection: CellSelection, rowCount: number, colCount: number): { minRow: number; maxRow: number; minCol: number; maxCol: number } {
  const rowMax = Math.max(0, rowCount - 1);
  const colMax = Math.max(0, colCount - 1);
  const anchorRow = clamp(selection.anchorRow, 0, rowMax);
  const focusRow = clamp(selection.focusRow, 0, rowMax);
  const anchorCol = clamp(selection.anchorCol, 0, colMax);
  const focusCol = clamp(selection.focusCol, 0, colMax);
  return {
    minRow: Math.min(anchorRow, focusRow),
    maxRow: Math.max(anchorRow, focusRow),
    minCol: Math.min(anchorCol, focusCol),
    maxCol: Math.max(anchorCol, focusCol)
  };
}

function cellSelectionToTsv(selection: CellSelection, tracks: TrackInfo[], columns: ListColumn[], displayUnit: DisplayUnit): string {
  if (tracks.length === 0 || columns.length === 0) return "";
  const range = normalizeCellSelection(selection, tracks.length, columns.length);
  const selectedColumns = selectableColumnsInRange(columns, range.minCol, range.maxCol);
  if (selectedColumns.length === 0) return "";
  return tracks
    .slice(range.minRow, range.maxRow + 1)
    .map((track) => selectedColumns.map((column) => listCellText(track, column.key, displayUnit)).join("\t"))
    .join("\n");
}

function listCellText(track: TrackInfo, columnKey: ListColumnKey, displayUnit: DisplayUnit): string {
  switch (columnKey) {
    case "fileName":
      return track.fileName;
    case "format":
      return `${track.format.toUpperCase()} ${formatDetails(track)}`;
    case "sampleRate":
      return String(track.sampleRate);
    case "bitDepth":
      return track.bitDepth === null ? "Vorbis" : String(track.bitDepth);
    case "durationSamples":
      return displayUnit === "samples" ? String(track.durationSamples) : formatTime(track.durationMs);
    case "loopStart":
      return track.loop ? (displayUnit === "samples" ? String(track.loop.startSample) : formatTime(sampleToMs(track.loop.startSample, track.sampleRate))) : "";
    case "loopEnd":
      return track.loop ? (displayUnit === "samples" ? String(track.loop.endSample) : formatTime(sampleToMs(track.loop.endSample, track.sampleRate))) : "";
    case "loopLength":
      return track.loop ? (displayUnit === "samples" ? String(track.loop.lengthSamples) : formatTime(sampleToMs(track.loop.lengthSamples, track.sampleRate))) : "";
    case "confidence":
      return track.loop?.confidence?.toFixed(1) ?? "";
    case "validation":
      return track.validation;
    case "outputPath":
      return track.outputPath;
  }
}

function applyCellRangeTsv(
  text: string,
  selection: CellSelection,
  tracks: TrackInfo[],
  columns: ListColumn[],
  displayUnit: DisplayUnit,
  patchTrack: (id: string, patch: Partial<TrackInfo>) => void,
  settings: DetectionSettings
): void {
  if (tracks.length === 0 || columns.length === 0) return;
  const lines = text.replace(/\r/g, "").split("\n").filter((line) => line.length > 0);
  if (lines.length === 0) return;
  const range = normalizeCellSelection(selection, tracks.length, columns.length);
  const selectedColumns = selectableColumnsInRange(columns, range.minCol, range.maxCol);
  if (selectedColumns.length === 0) return;
  lines.forEach((line, rowOffset) => {
    const track = tracks[range.minRow + rowOffset];
    if (!track) return;
    const currentLoop = track.loop ?? {
      startSample: 0,
      endSample: Math.min(track.durationSamples, msToSample(settings.minimumLoopMs, track.sampleRate)),
      lengthSamples: Math.min(track.durationSamples, msToSample(settings.minimumLoopMs, track.sampleRate)),
      confidence: null,
      source: "manual" as const
    };
    const nextLoop = {
      ...currentLoop,
      source: "manual" as const,
      confidence: currentLoop.confidence
    };
    let touchedLoop = false;
    let validationOverride: string | null = null;

    line.split("\t").forEach((cell, colOffset) => {
      const column = selectedColumns[colOffset];
      if (!column || !isEditableListColumn(column.key)) return;
      const value = parsePositionInput(cell, track.sampleRate, displayUnit);
      if (value === null) {
        if (column.key === "loopLength") validationOverride = `Invalid loop length input: ${cell}`;
        return;
      }
      touchedLoop = true;
      if (column.key === "loopStart") nextLoop.startSample = clamp(Math.round(value), 0, track.durationSamples);
      if (column.key === "loopEnd") nextLoop.endSample = clamp(Math.round(value), 0, track.durationSamples);
      if (column.key === "loopLength") {
        const lengthSamples = Math.round(value);
        if (lengthSamples <= 0) {
          validationOverride = "Loop length must be greater than zero.";
          return;
        }
        if (nextLoop.startSample + lengthSamples > track.durationSamples) {
          validationOverride = "Loop length pushes loop end past audio duration.";
          return;
        }
        nextLoop.endSample = nextLoop.startSample + lengthSamples;
      }
    });
    if (!touchedLoop && !validationOverride) return;
    nextLoop.lengthSamples = nextLoop.endSample - nextLoop.startSample;
    const validation = validationOverride ?? validateLoop(track, nextLoop, settings);
    patchTrack(track.id, {
      loop: validationOverride ? track.loop : nextLoop,
      status: statusFromValidation(validation),
      validation
    });
  });
}

function selectableColumnsInRange(columns: ListColumn[], minCol: number, maxCol: number): ListColumn[] {
  return columns.slice(minCol, maxCol + 1).filter((column) => isSelectableListColumn(column.key));
}

function isSelectableListColumn(columnKey: ListColumnKey): boolean {
  return columnKey !== "format" && columnKey !== "confidence" && columnKey !== "validation";
}

function isEditableListColumn(columnKey: ListColumnKey): columnKey is "loopStart" | "loopEnd" | "loopLength" {
  return columnKey === "loopStart" || columnKey === "loopEnd" || columnKey === "loopLength";
}

function applyTsv(
  text: string,
  tracks: TrackInfo[],
  displayUnit: DisplayUnit,
  patchLoopSample: (track: TrackInfo, field: "startSample" | "endSample", value: number) => void,
  patchLoopLength: (track: TrackInfo, value: number | null, invalidInput?: string) => void
): void {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return;
  const first = lines[0].split("\t").map((cell) => cell.trim().toLowerCase());
  const hasHeader = first.some((cell) => cell.includes("loop") || cell === "file");
  const headers = hasHeader ? first : ["file", "loop start sample", "loop end sample"];
  const rows = hasHeader ? lines.slice(1) : lines;
  const fileIndex = headers.findIndex((item) => item === "file" || item === "file name");
  const startIndex = headers.findIndex((item) => item.includes("loop start"));
  const endIndex = headers.findIndex((item) => item.includes("loop end"));
  const lengthIndex = headers.findIndex((item) => item.includes("loop length"));

  rows.forEach((line, index) => {
    const cells = line.split("\t");
    const track = fileIndex >= 0 ? tracks.find((item) => item.fileName === cells[fileIndex]) : tracks[index];
    if (!track) return;
    const startDisplayUnit = headers[startIndex]?.includes("sample") ? "samples" : displayUnit;
    const endDisplayUnit = headers[endIndex]?.includes("sample") ? "samples" : displayUnit;
    const lengthDisplayUnit = headers[lengthIndex]?.includes("sample") ? "samples" : displayUnit;
    if (startIndex >= 0 && cells[startIndex]) {
      const value = parsePositionInput(cells[startIndex], track.sampleRate, startDisplayUnit);
      if (value !== null) patchLoopSample(track, "startSample", value);
    }
    if (endIndex >= 0 && cells[endIndex]) {
      const value = parsePositionInput(cells[endIndex], track.sampleRate, endDisplayUnit);
      if (value !== null) patchLoopSample(track, "endSample", value);
    } else if (lengthIndex >= 0 && cells[lengthIndex]) {
      const value = parsePositionInput(cells[lengthIndex], track.sampleRate, lengthDisplayUnit);
      patchLoopLength(track, value, value === null ? cells[lengthIndex] : undefined);
    }
  });
}

function formatEditablePosition(sample: number, sampleRate: number, displayUnit: DisplayUnit): string {
  return displayUnit === "samples" ? String(sample) : formatTime(sampleToMs(sample, sampleRate));
}

function parsePositionInput(input: string, sampleRate: number, displayUnit: DisplayUnit): number | null {
  const normalized = input.trim().replace(/,/g, "");
  if (!normalized) return null;
  if (displayUnit === "samples") {
    const sample = Number.parseInt(normalized, 10);
    return Number.isFinite(sample) ? Math.max(0, sample) : null;
  }
  const totalSeconds = parseTimeSeconds(normalized);
  return totalSeconds === null ? null : msToSample(totalSeconds * 1000, sampleRate);
}

function parseTimeSeconds(input: string): number | null {
  if (!input.includes(":")) {
    const seconds = Number.parseFloat(input);
    return Number.isFinite(seconds) ? Math.max(0, seconds) : null;
  }
  const parts = input.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const seconds = Number.parseFloat(parts[parts.length - 1]);
  const minutes = Number.parseInt(parts[parts.length - 2], 10);
  const hours = parts.length === 3 ? Number.parseInt(parts[0], 10) : 0;
  if (![seconds, minutes, hours].every(Number.isFinite)) return null;
  return Math.max(0, hours * 3600 + minutes * 60 + seconds);
}

function EditablePosition({
  value,
  sampleRate,
  displayUnit,
  onCommit,
  onInvalid
}: {
  value: number;
  sampleRate: number;
  displayUnit: DisplayUnit;
  onCommit: (value: number) => void;
  onInvalid?: (input: string) => void;
}): React.ReactElement {
  const [draft, setDraft] = useState(formatEditablePosition(value, sampleRate, displayUnit));

  useEffect(() => {
    setDraft(formatEditablePosition(value, sampleRate, displayUnit));
  }, [value, sampleRate, displayUnit]);

  function commit(): void {
    const parsed = parsePositionInput(draft, sampleRate, displayUnit);
    if (parsed !== null) {
      onCommit(parsed);
      setDraft(formatEditablePosition(parsed, sampleRate, displayUnit));
      return;
    }
    onInvalid?.(draft);
    setDraft(formatEditablePosition(value, sampleRate, displayUnit));
  }

  return (
    <input
      className="cell-input"
      value={draft}
      onFocus={(event) => event.currentTarget.select()}
      onMouseUp={(event) => {
        event.preventDefault();
        event.currentTarget.select();
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function FormatCell({ track }: { track: TrackInfo }): React.ReactElement {
  return (
    <span className="format-cell">
      <span className={`badge ${track.format}`}>{track.format.toUpperCase()}</span>
      <span className="format-details">{formatDetails(track)}</span>
    </span>
  );
}

function StatusPill({ status, language }: { status: TrackStatus; language: Language }): React.ReactElement {
  return <span className={`status-pill ${status}`}><span />{statusLabel(status, language)}</span>;
}

function ConfidenceBar({ value }: { value: number | null }): React.ReactElement {
  const pct = value ?? 0;
  return (
    <div className="confidence">
      <span>{formatPercent(value)}</span>
      <i><b style={{ width: `${clamp(pct, 0, 100)}%` }} /></i>
    </div>
  );
}

function SortIndicator({ rules, column }: { rules: SortRule[]; column: SortRule["key"] }): React.ReactElement {
  const index = rules.findIndex((rule) => rule.key === column);
  if (index < 0) return <span className="sort-indicator">sort</span>;
  return <span className="sort-indicator active">{rules[index].direction === "asc" ? "asc" : "desc"}{rules.length > 1 ? index + 1 : ""}</span>;
}

function nextSortRules(current: SortRule[], key: SortRule["key"], multi: boolean): SortRule[] {
  const existing = current.find((rule) => rule.key === key);
  const next: SortRule = { key, direction: existing?.direction === "asc" ? "desc" : "asc" };
  if (!multi) return [next];
  return [...current.filter((rule) => rule.key !== key), next].slice(-3);
}

function filterTracks(tracks: TrackInfo[], filter: string): TrackInfo[] {
  const query = filter.trim().toLowerCase();
  if (!query) return tracks;
  return tracks.filter((track) => `${track.fileName} ${track.format} ${track.status} ${track.validation} ${track.outputPath}`.toLowerCase().includes(query));
}

function hasDraggedFiles(event: React.DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes("Files") || event.dataTransfer.files.length > 0;
}

function sortTracks(tracks: TrackInfo[], rules: SortRule[]): TrackInfo[] {
  return [...tracks].sort((a, b) => {
    for (const rule of rules) {
      const aValue = sortValue(a, rule.key);
      const bValue = sortValue(b, rule.key);
      const result = compareValues(aValue, bValue);
      if (result !== 0) return rule.direction === "asc" ? result : -result;
    }
    return a.fileName.localeCompare(b.fileName);
  });
}

function sortValue(track: TrackInfo, key: SortRule["key"]): string | number | null {
  if (key === "confidence") return track.loop?.confidence ?? -1;
  if (key === "loopStart") return track.loop?.startSample ?? -1;
  if (key === "loopEnd") return track.loop?.endSample ?? -1;
  if (key === "loopLength") return track.loop?.lengthSamples ?? -1;
  return track[key] as string | number | null;
}

function compareValues(a: string | number | null, b: string | number | null): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function displayValidation(validation: string, language: Language): string {
  if (language === "en") return validation;
  const detected = validation.match(/^Detected at ([\d.]+)%\.$/);
  if (detected) return `${detected[1]}% で検出しました。`;
  const noLoop = validation.match(/^No loop candidate reached ([\d.]+)%\.$/);
  if (noLoop) return `${noLoop[1]}% に達するループ候補が見つかりません。`;
  const saved = validation.match(/^Saved (.+)\.$/);
  if (saved) return `${saved[1]} を保存しました。`;
  if (validation === "Loop metadata loaded.") return "ループメタデータを読み込みました。";
  if (validation === "Edited manually.") return "手動で編集しました。";
  if (validation === "No loop marker is set.") return "ループマーカーが設定されていません。";
  if (validation === "Loop points are outside the audio duration.") return "ループポイントが音声の範囲外です。";
  if (validation === "Loop end must be after loop start.") return "ループ終了はループ開始より後にしてください。";
  if (validation === "Loop length is below the minimum loop setting.") return "ループ長が最短ループ設定を下回っています。";
  if (validation === "Loop length cannot be set before loop start is set.") return "ループ開始が未設定のため、ループ長を設定できません。";
  if (validation === "Loop length must be greater than zero.") return "ループ長は0より大きい値にしてください。";
  if (validation === "Loop length pushes loop end past audio duration.") return "ループ長を適用するとループ終了が音声の長さを超えます。";
  if (validation === "Auto Loop canceled before this track finished.") return "このトラックの処理完了前に自動ループを中止しました。";
  const invalidLength = validation.match(/^Invalid loop length input: ?(.*)$/);
  if (invalidLength) return `ループ長の入力値が不正です: ${invalidLength[1] || "空の入力"}`;
  if (validation === "Updated from TSV paste.") return "TSV貼り付けから更新しました。";
  return validation;
}

function isWarningTrack(track: TrackInfo): boolean {
  return track.status === "low-confidence" || track.status === "no-loop" || track.status === "warning";
}

function statusFromValidation(validation: string): TrackStatus {
  return validation === "Edited manually." ? "edited" : "warning";
}

function validateLoop(track: TrackInfo, loop: { startSample: number; endSample: number; lengthSamples: number }, settings: DetectionSettings): string {
  if (loop.startSample < 0 || loop.endSample > track.durationSamples) return "Loop points are outside the audio duration.";
  if (loop.endSample <= loop.startSample) return "Loop end must be after loop start.";
  if (sampleToMs(loop.lengthSamples, track.sampleRate) < settings.minimumLoopMs) return "Loop length is below the minimum loop setting.";
  return "Edited manually.";
}

function buildWavePath(min: number[], max: number[], width: number, yBase: number, scale: number): string {
  const count = Math.max(1, min.length);
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = (i / (count - 1 || 1)) * width;
    top.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)},${(yBase - max[i] * scale).toFixed(2)}`);
    bottom.unshift(`L${x.toFixed(2)},${(yBase - min[i] * scale).toFixed(2)}`);
  }
  return `${top.join(" ")} ${bottom.join(" ")} Z`;
}

function formatKhz(sampleRate: number): string {
  return `${(sampleRate / 1000).toFixed(sampleRate % 1000 === 0 ? 0 : 1)} kHz`;
}

function formatDetails(track: TrackInfo): string {
  return `${formatKhz(track.sampleRate)} / ${track.bitDepth ? `${track.bitDepth}-bit` : "Vorbis"}`;
}

function statusLabel(status: TrackStatus, language: Language): string {
  const labels: Record<TrackStatus, UiKey> = {
    pending: "pending",
    processing: "processing",
    detected: "detected",
    "low-confidence": "lowConfidence",
    "no-loop": "noLoopFound",
    edited: "edited",
    warning: "warningStatus",
    canceled: "canceled",
    saved: "saved",
    error: "error"
  };
  return ui(language, labels[status]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createDemoTracks(): TrackInfo[] {
  if (!new URLSearchParams(window.location.search).has("demo")) {
    return [];
  }
  const names = [
    ["battle_theme.wav", "wav", 44100, 24, 135872, 97],
    ["dungeon_ambience.ogg", "ogg", 48000, null, 182441, 93],
    ["town_day.aiff", "aiff", 44100, 16, 167946, 96],
    ["boss_theme.wav", "wav", 44100, 24, 148219, 92],
    ["victory_fanfare.ogg", "ogg", 48000, null, 48000, 71],
    ["cave_ambience.ogg", "ogg", 48000, null, 210115, null]
  ] as const;

  return names.map(([fileName, format, sampleRate, bitDepth, durationSecMs, confidence], index) => {
    const durationSamples = Math.round((durationSecMs / 1000) * sampleRate);
    const startSample = Math.round(((index + 3) * 1.72) * sampleRate);
    const lengthSamples = Math.min(Math.round(60 * sampleRate), Math.max(0, durationSamples - startSample - Math.round(3 * sampleRate)));
    const hasLoop = confidence !== null && lengthSamples > 0;
    return {
      id: `demo-${index}`,
      filePath: `C:/Music/${fileName}`,
      fileName,
      outputPath: `C:/Music/${fileName.replace(/\.(wav|aiff|ogg)$/i, "_looped.$1")}`,
      format,
      sampleRate,
      bitDepth,
      channels: 2,
      durationSamples,
      durationMs: durationSecMs,
      loop: hasLoop
        ? {
            startSample,
            endSample: startSample + lengthSamples,
            lengthSamples,
            confidence,
            source: "detected"
          }
        : null,
      status: confidence === null ? "no-loop" : confidence < 90 ? "low-confidence" : "detected",
      validation: confidence === null ? "No loop candidate reached 95%." : `Detected at ${confidence.toFixed(1)}%.`,
      waveform: createDemoWaveform(index)
    } satisfies TrackInfo;
  });
}

function createDemoWaveform(seed: number) {
  const points = 1400;
  const channels = [0, 1].map((channel) => {
    const min: number[] = [];
    const max: number[] = [];
    for (let i = 0; i < points; i += 1) {
      const fade = Math.min(1, i / 80, (points - i) / 180);
      const env = (0.28 + 0.24 * Math.sin(i / (41 + seed * 3)) + 0.13 * Math.sin(i / 13 + seed)) * fade;
      const spike = 0.08 * Math.sin(i / 3.7 + channel);
      min.push(-Math.max(0.05, env + spike));
      max.push(Math.max(0.05, env - spike * 0.6));
    }
    return { min, max };
  });
  return { resolution: 4096, channels };
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found.");
}

createRoot(rootElement).render(<App />);
