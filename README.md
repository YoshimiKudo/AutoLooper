# AutoLooper

## 日本語

AutoLooper は、ゲーム音楽向けのループマーカー検出・編集デスクトップアプリです。WAV、AIFF、Ogg Vorbis、MP3 ファイルを読み込み、最良のループ候補を自動採用し、波形表示とリストエディタの両方で確認・編集できます。

### ダウンロード

最新版は GitHub Releases から取得できます。

- **アプリ本体をダウンロード**: [AutoLooper.0.1.0.exe](https://github.com/YoshimiKudo/AutoLooper/releases/download/v0.1.0-beta/AutoLooper.0.1.0.exe)
- **紹介動画を見る**: [X の投稿で再生](https://x.com/yoshimikudo/status/2061571506950599070)
- **チェックサム**: [SHA256SUMS.txt](https://github.com/YoshimiKudo/AutoLooper/releases/download/v0.1.0-beta/SHA256SUMS.txt)
- **リリースページ**: [AutoLooper v0.1.0-beta](https://github.com/YoshimiKudo/AutoLooper/releases/tag/v0.1.0-beta)

`SHA256SUMS.txt` は、ダウンロードした exe がリリース時のファイルと一致するか確認するためのファイルです。

### 紹介動画

[![AutoLooper 紹介動画](docs/autolooper-video-thumbnail.png)](https://x.com/yoshimikudo/status/2061571506950599070)

画像をクリックすると X の投稿で紹介動画を再生できます。

### 対応環境

- Windows
- macOS は将来対応予定
- 現在の exe はコード署名されていません。Windows SmartScreen の警告が表示される場合があります。

### Windows SmartScreen について

現在のベータ版 exe はコード署名されていないため、初回起動時に Windows Defender SmartScreen の「Windows によって PC が保護されました」または「不明な発行元」の警告が出る場合があります。

公式配布は GitHub Releases のみです。ダウンロード先がこのリポジトリの Release であることを確認し、必要に応じて `SHA256SUMS.txt` でファイルの一致を確認してください。

警告画面から起動する場合:

1. `詳細情報` を選択
2. `実行` を選択

会社PCや Smart App Control が有効な環境では、組織のセキュリティ設定により実行できない場合があります。

### 主な機能

- `.wav`、`.aif`、`.aiff`、`.ogg`、`.mp3` の読み込み
- Ogg は Vorbis を対象
- MP3 は読み込み、波形表示、自動検出、手動マーカー編集、ループ再生に対応
- MP3 へのループマーカー埋め込み保存は非対応。保存時に警告を表示
- 複数ファイルの一括読み込みと一括検出
- 最良候補を自動採用するループ検出
- 波形上のループ開始・終了マーカー表示
- 波形上でループ区間をドラッグして平行移動
- ループ開始、ループ終了、ループ長の編集
- サンプル数表示と秒数表示の切り替え
- リストエディタでのソート、列並び替え、矩形範囲コピー
- 検出プリセット: `High / Mid / Low / Custom`
- カスタム検出プリセットの保存
- `_looped.wav` のような別名コピー保存
- WAV / AIFF / Ogg ファイルへのループメタデータ書き込み

### 検出設定

- 照合区間: ループ候補の比較に使う音声区間の長さ
- 必要一致率: 候補を採用するために必要な最低スコア
- 最短ループ: これより短い候補を無視する下限
- ループ確認開始位置: `Loop End` の何 ms 前から再生確認を始めるか

`Custom` プリセットは現在の検出設定を保存します。保存値はアプリ内のローカルストレージに保持されます。

### 再生とループ確認

通常の再生では、ループマーカーがあるトラックの場合、先頭から再生し、`Loop End` に到達すると `Loop Start` へ戻って再生を継続します。ループマーカーがないトラックは通常どおり最後まで再生します。

`Check Loop` は、ループマーカーがあるトラックでのみ有効です。`Loop End` の指定 ms 前から再生し、`Loop End` に到達すると `Loop Start` へ戻って再生を継続します。停止するまでループを繰り返します。

### 開発用起動

CMD:

```bat
cd /d <path-to-AutoLooper>
npm.cmd run dev
```

PowerShell:

```powershell
Set-Location "<path-to-AutoLooper>"
npm.cmd run dev
```

### ビルドとテスト

```bat
npm.cmd run build
npm.cmd test
```

### exe 生成

unpacked 版:

```bat
npm.cmd run dist:dir
```

portable exe:

```bat
npm.cmd run dist
```

生成物は `release` フォルダに出力されます。

### 注意

- 自動保存は行いません。保存操作を実行したときだけ、ループ付きコピーを書き出します。
- MP3 はループマーカーのアプリ内利用には対応しますが、MP3ファイル自体への埋め込み保存には対応しません。
- ループ長などに無効な値を入力すると、トラック状態が警告になり、検証欄に理由が表示されます。
- 現在の開発・検証環境は Windows です。macOS 対応は将来想定です。
- 現在の exe はコード署名されていません。
- SmartScreen 警告が出た場合は、公式 Release から取得したファイルであることを確認し、必要に応じて `詳細情報` から実行してください。

### サポートと連絡先

- バグ報告や改善要望は GitHub Issues を使う想定です。
- 公式サイト: https://yoshimi-kudo.com/
- X: https://x.com/yoshimikudo

### ライセンス

ライセンス方針は未確定です。再利用条件を明確にする必要がある場合は、LICENSE ファイルを追加してください。

---

## English

AutoLooper is a desktop app for detecting and editing loop markers in game music files. It imports WAV, AIFF, Ogg Vorbis, and MP3 files, automatically adopts the best loop candidate, and lets you review and edit loop points in both waveform and list editor views.

### Download

The latest build is available from GitHub Releases.

- **Download the app**: [AutoLooper.0.1.0.exe](https://github.com/YoshimiKudo/AutoLooper/releases/download/v0.1.0-beta/AutoLooper.0.1.0.exe)
- **Watch the intro video**: [Play it on X](https://x.com/yoshimikudo/status/2061571506950599070)
- **Checksum**: [SHA256SUMS.txt](https://github.com/YoshimiKudo/AutoLooper/releases/download/v0.1.0-beta/SHA256SUMS.txt)
- **Release page**: [AutoLooper v0.1.0-beta](https://github.com/YoshimiKudo/AutoLooper/releases/tag/v0.1.0-beta)

`SHA256SUMS.txt` is provided to verify that the downloaded exe matches the release artifact.

### Feature Intro Video

[![AutoLooper feature intro video](docs/autolooper-video-thumbnail.png)](https://x.com/yoshimikudo/status/2061571506950599070)

Click the thumbnail to play the intro video on X.

### Supported Environment

- Windows
- macOS support is planned for a future release
- The current exe is not code-signed, so Windows SmartScreen may show a warning.

### Windows SmartScreen

The current beta executable is not code-signed. On first launch, Windows Defender SmartScreen may show a warning such as "Windows protected your PC" or "Unknown publisher".

The official distribution source is GitHub Releases only. Confirm that the file was downloaded from this repository's Release page, and use `SHA256SUMS.txt` if you want to verify that the file matches the release artifact.

If you choose to run it from the SmartScreen warning:

1. Select `More info`
2. Select `Run anyway`

On company-managed PCs or environments with Smart App Control enabled, organization security policy may prevent the app from running.

### Features

- Import `.wav`, `.aif`, `.aiff`, `.ogg`, and `.mp3` files
- Ogg support targets Vorbis
- MP3 supports import, waveform display, automatic detection, manual marker editing, and loop playback
- MP3 loop marker embedding is not supported. The app shows a warning when saving MP3 tracks
- Batch import and batch detection
- Automatic adoption of the best loop candidate
- Waveform display with loop start and loop end markers
- Drag-to-shift loop ranges on the waveform
- Edit loop start, loop end, and loop length
- Toggle display between samples and time
- List editor with sorting, column reordering, and rectangular cell copy
- Detection presets: `High / Mid / Low / Custom`
- Saved custom detection preset
- Save looped copies using names such as `_looped.wav`
- Write loop metadata into WAV / AIFF / Ogg files

### Detection Settings

- Match Window: Audio duration used to compare loop candidates
- Required Match: Minimum score required to accept a candidate
- Minimum Loop: Shortest allowed loop length
- Loop Check Preroll: How many ms before `Loop End` playback starts when checking the loop

The `Custom` preset saves the current detection settings. Saved values are stored in the app's local storage.

### Playback and Loop Check

During normal playback, tracks with loop markers play from the beginning and jump from `Loop End` back to `Loop Start`. Tracks without loop markers play through to the end.

`Check Loop` is enabled only for tracks with loop markers. Playback starts shortly before `Loop End`, jumps back to `Loop Start` when it reaches `Loop End`, and continues looping until stopped.

### Development

CMD:

```bat
cd /d <path-to-AutoLooper>
npm.cmd run dev
```

PowerShell:

```powershell
Set-Location "<path-to-AutoLooper>"
npm.cmd run dev
```

### Build and Test

```bat
npm.cmd run build
npm.cmd test
```

### Build Executables

Unpacked app:

```bat
npm.cmd run dist:dir
```

Portable exe:

```bat
npm.cmd run dist
```

Build outputs are written to the `release` folder.

### Notes

- The app does not autosave. Looped copies are written only when the save action is executed.
- MP3 markers can be used inside the app, but cannot be embedded back into MP3 files.
- Invalid loop length input sets the track status to warning and shows the reason in the validation column.
- macOS support is planned for the future. Current development and verification are on Windows.
- The current exe is not code-signed.
- If SmartScreen shows a warning, verify that the file came from the official Release page and use `More info` if you choose to run it.

### Support and Contact

- Bug reports and feature requests are expected to be handled through GitHub Issues.
- Official website: https://yoshimi-kudo.com/
- X: https://x.com/yoshimikudo

### License

The license policy has not been decided yet. Add a LICENSE file before publishing reuse terms.
