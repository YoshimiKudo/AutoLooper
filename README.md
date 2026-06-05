# AutoLooper

## Download / ダウンロード

**Windows版アプリ本体**: [AutoLooper.0.4.0.exe](https://github.com/YoshimiKudo/AutoLooper/releases/download/v0.4.0-beta/AutoLooper.0.4.0.exe)

**macOS実験版（未署名・作者未検証）**: [AutoLooper.0.4.0.mac.dmg](https://github.com/YoshimiKudo/AutoLooper/releases/download/v0.4.0-macos-experimental/AutoLooper.0.4.0.mac.dmg)

最新版のリリースページ: [AutoLooper Releases](https://github.com/YoshimiKudo/AutoLooper/releases)

The latest Windows portable exe is available from the link above.
An unsigned macOS experimental build is also available for users who accept unverified test builds.

---

## 日本語

AutoLooper は、ゲーム音楽向けのループマーカー検出・編集デスクトップアプリです。音声ファイルを読み込み、自動検出したループ候補をマーカーとして採用し、波形ビューとリスト編集ビューで確認・編集できます。

### バージョン情報

- アプリバージョン: `0.4.0`
- リリースタグ: `v0.4.0-beta`
- リリース日: `2026-06-03` JST
- 種別: ベータ / プレリリース
- 対応環境: Windows
- macOS: 実験版あり（未署名・作者Mac実機未検証）

### 対応形式

- `.wav`
- `.aif` / `.aiff`
- `.ogg`（Ogg Vorbis）
- `.mp3`
- `.flac`
- `.opus`（Ogg Opus）

### ループマーカー保存

- WAV: `smpl` メタデータへ書き込み
- AIFF: `MARK` / `INST` メタデータへ書き込み
- Ogg Vorbis: Vorbis Comment へ `LOOPSTART` / `LOOPEND` / `LOOPLENGTH` を書き込み
- FLAC: Vorbis Comment へ `LOOPSTART` / `LOOPEND` / `LOOPLENGTH` を書き込み
- Opus: OpusTags へ `LOOPSTART` / `LOOPEND` / `LOOPLENGTH` を書き込み
- MP3: AutoLooper内ではループマーカーを設定できますが、MP3ファイル自体への埋め込み保存には対応していません。保存確認時に警告を表示します。

FLAC / Opus のループ情報はメタデータとして保存できますが、外部プレイヤーやゲームエンジンがそのタグをループ再生に使うかどうかは環境依存です。

### 主な機能

- 複数音声ファイルの一括読み込み
- 選択ファイルまたは全ファイルの自動ループ検出
- `Normal / Deep / Custom` の検出モード
- `Normal`: 波形一致を中心にした通常検出
- `Deep`: ビート位置と音量差も考慮する精密検出
- `Custom`: 検出方式とパラメータを保存して再利用
- 検出中の進捗表示、経過秒数表示、中止操作
- Deep Scan 専用の控えめなスキャンアニメーション
- 波形上のループ開始・終了マーカー表示
- ループ区間のドラッグ移動
- 通常再生時も `Loop End` から `Loop Start` へ戻るループ再生
- `Check Loop` によるループ継ぎ目確認
- `<<` / `>>` による前後ファイル移動と連続ループ確認
- ファイル切り替え時の短いフェードによるクリックノイズ低減
- 波形ビューで表示中のファイルをリスト上でも強調表示
- ループ開始、ループ終了、ループ長の数値編集
- サンプル数表示 / 秒数表示の切り替え
- リスト編集ビューでのソート、列並び替え、範囲コピー&ペースト
- チェックセルのクリック/ドラッグによる複数選択
- 保存前確認ダイアログ
- 保存先フォルダとファイル名追加文字の設定
- 同名ファイルがある場合の自動ナンバリング保存
- 保存結果ダイアログと保存先フォルダを開く機能
- Undo / Redo
- 日本語 / 英語表示切り替え

### 保存仕様

保存は元ファイルを直接上書きせず、別名コピーとして保存します。初期設定では元ファイルと同じフォルダに `_looped` を付加して保存します。

例:

- `battle.wav`
- `battle_looped.wav`

同名ファイルが既に存在する場合は、自動で番号を付けて保存します。

例:

- `battle_looped.wav` が既にある場合
- `battle_looped_2.wav` として保存

保存結果ダイアログでは、番号付き保存を行った理由も表示します。

### 保存設定

保存先フォルダとファイル名に追加する文字は、メニューバーの `File > Save Settings...` から設定できます。保存確認ダイアログ内でも、保存直前に保存先と追加文字を変更できます。

### Windows SmartScreen について

現在のベータ版 exe はコード署名されていません。初回起動時に Windows Defender SmartScreen の「Windows によって PC が保護されました」または「不明な発行元」の警告が表示される場合があります。

公式配布は GitHub Releases のみです。ダウンロード先がこのリポジトリの Release であることを確認してください。

警告画面から起動する場合:

1. `詳細情報` を選択
2. `実行` を選択

会社PCや Smart App Control が有効な環境では、組織のセキュリティ設定により実行できない場合があります。

### macOS実験版について

macOS版は未署名の実験版です。作者は現在Mac実機の検証環境を持っていないため、実機での手動検証は行っていません。

起動できない、Gatekeeperで止まる、読み込み・再生・保存が動かないなどの問題がある場合は、下記テンプレートから報告してください。

[macOS版のIssueを作成](https://github.com/YoshimiKudo/AutoLooper/issues/new?template=macos-test-report.yml)

報告時は、macOSバージョン、Intel / Apple Silicon、使用したファイル名、起動できたか、どの操作で問題が出たかを書いてください。

未署名アプリのため、macOSのGatekeeperで起動が止められる場合があります。起動する場合は、右クリックから `開く` を選ぶか、`システム設定 > プライバシーとセキュリティ` を確認してください。

### 開発用起動

```bat
cd /d <path-to-AutoLooper>
npm.cmd run dev
```

### ビルド

```bat
npm.cmd run build
npm.cmd run dist
```

macOS実験版はGitHub ActionsのmacOS runnerで作成します。

```sh
npm run dist:mac
```

---

## English

AutoLooper is a desktop app for detecting, editing, previewing, and saving loop markers for game music files.

### Version

- App version: `0.4.0`
- Release tag: `v0.4.0-beta`
- Release date: `2026-06-03` JST
- Type: beta / pre-release
- Target platform: Windows
- macOS: experimental unsigned build available, not manually verified by the author on real Mac hardware

### Supported Formats

- `.wav`
- `.aif` / `.aiff`
- `.ogg` (Ogg Vorbis)
- `.mp3`
- `.flac`
- `.opus` (Ogg Opus)

### Loop Marker Saving

- WAV: writes to `smpl` metadata
- AIFF: writes to `MARK` / `INST` metadata
- Ogg Vorbis: writes `LOOPSTART` / `LOOPEND` / `LOOPLENGTH` to Vorbis Comment
- FLAC: writes `LOOPSTART` / `LOOPEND` / `LOOPLENGTH` to Vorbis Comment
- Opus: writes `LOOPSTART` / `LOOPEND` / `LOOPLENGTH` to OpusTags
- MP3: loop markers can be edited inside AutoLooper, but cannot be embedded into MP3 files. A warning is shown before saving.

FLAC and Opus loop markers are stored as metadata. Whether external players or game engines use those tags for loop playback depends on the target environment.

### Features

- Batch import for multiple audio files
- Auto loop detection for selected files or all files
- Detection modes: `Normal / Deep / Custom`
- `Normal`: fast waveform-similarity based detection
- `Deep`: more detailed detection using beat-like positions and loudness differences
- `Custom`: saves detection mode and parameters
- Detection progress, elapsed time, and cancellation
- Subtle Deep Scan animation
- Waveform loop start/end marker display
- Dragging loop ranges on the waveform
- Normal playback loops from `Loop End` back to `Loop Start`
- `Check Loop` playback for checking loop seams
- Previous/next file navigation with `<<` / `>>` for faster loop checking
- Short playback fades during file switching to reduce click noise
- The file shown in the waveform view is highlighted in the file list
- Numeric editing for loop start, loop end, and loop length
- Sample/time display switching
- List editor sorting, column reordering, and Excel-like range copy/paste
- Multi-select by clicking or dragging the selection cell
- Save confirmation dialog
- Output folder and filename suffix settings
- Automatic numbering when the output filename already exists
- Save result dialog and open saved folder action
- Undo / Redo
- Japanese / English UI switching

### Save Behavior

AutoLooper does not overwrite the original file. It saves a separate copy. By default, the output is saved beside the source file with `_looped` added to the filename.

Example:

- `battle.wav`
- `battle_looped.wav`

If the output name already exists, AutoLooper automatically saves with a numbered filename.

Example:

- If `battle_looped.wav` already exists
- AutoLooper saves `battle_looped_2.wav`

The save result dialog reports when automatic numbering was used.

### Save Settings

The output folder and filename suffix can be configured from `File > Save Settings...`. They can also be changed directly in the save confirmation dialog before saving.

### Windows SmartScreen

The current beta exe is not code-signed. Windows Defender SmartScreen may show an unknown publisher warning on first launch.

Official downloads are provided only through GitHub Releases. Confirm that the download is from this repository's release page.

To launch from the warning dialog:

1. Select `More info`
2. Select `Run anyway`

Company-managed PCs or environments with Smart App Control may block unsigned apps depending on their security policy.

### macOS Experimental Build

The macOS build is unsigned and experimental. The author does not currently have a Mac test environment, so it has not been manually verified on real macOS hardware.

If the app cannot launch, is blocked by Gatekeeper, or has import, playback, detection, or save issues, please report it here:

[Create a macOS issue](https://github.com/YoshimiKudo/AutoLooper/issues/new?template=macos-test-report.yml)

When reporting, include the macOS version, Intel / Apple Silicon, downloaded file, launch result, and the exact operation that caused the problem.

Because the app is unsigned, macOS Gatekeeper may block it. If you decide to run it, try right-clicking the app and selecting `Open`, or check `System Settings > Privacy & Security`.

### Development

```bat
cd /d <path-to-AutoLooper>
npm.cmd run dev
```

### Build

```bat
npm.cmd run build
npm.cmd run dist
```

The macOS experimental build is created on a GitHub Actions macOS runner.

```sh
npm run dist:mac
```
