# AutoLooper

## 日本語

AutoLooper は、ゲーム音楽向けのループマーカー検出・編集デスクトップアプリです。WAV、AIFF、Ogg Vorbis ファイルを読み込み、最良のループ候補を自動採用し、波形表示とリストエディタの両方で確認・編集できます。

### ダウンロード

最新版は GitHub Releases から取得します。

- Release: https://github.com/YoshimiKudo/AutoLooper/releases
- Windows portable exe: `AutoLooper.0.1.0.exe`
- 紹介動画: https://github.com/YoshimiKudo/AutoLooper/releases/download/v0.1.0-beta/AutoLooper_feature_intro_v0.1.0-beta.mp4
- `SHA256SUMS.txt`: ダウンロードした exe がリリース時のファイルと一致するか確認するためのチェックサム

### 対応環境

- Windows
- macOS は将来対応予定
- 現在の exe はコード署名されていません。Windows SmartScreen の警告が表示される場合があります。

### 主な機能

- `.wav`、`.aif`、`.aiff`、`.ogg` の読み込み
- Ogg は Vorbis を対象
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
- ループ長などに無効な値を入力すると、トラック状態が警告になり、検証欄に理由が表示されます。
- 現在の開発・検証環境は Windows です。macOS 対応は将来想定です。
- 現在の exe はコード署名されていません。

### サポートと連絡先

- バグ報告や改善要望は GitHub Issues を使う想定です。
- 公式サイト: https://yoshimi-kudo.com/
- X: https://x.com/yoshimikudo

### ライセンス

ライセンス方針は未確定です。Public 公開する場合は、再利用を許可する範囲に応じて LICENSE ファイルを追加してください。

---

## English

AutoLooper is a desktop app for detecting and editing loop markers in game music files. It imports WAV, AIFF, and Ogg Vorbis files, automatically adopts the best loop candidate, and lets you review and edit loop points in both waveform and list editor views.

### Download

The latest build is distributed through GitHub Releases.

- Release: https://github.com/YoshimiKudo/AutoLooper/releases
- Windows portable exe: `AutoLooper.0.1.0.exe`
- Feature intro video: https://github.com/YoshimiKudo/AutoLooper/releases/download/v0.1.0-beta/AutoLooper_feature_intro_v0.1.0-beta.mp4
- `SHA256SUMS.txt`: Checksum file for verifying that the downloaded exe matches the release artifact

### Supported Environment

- Windows
- macOS support is planned for a future release
- The current exe is not code-signed, so Windows SmartScreen may show a warning.

### Features

- Import `.wav`, `.aif`, `.aiff`, and `.ogg` files
- Ogg support targets Vorbis
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
- Invalid loop length input sets the track status to warning and shows the reason in the validation column.
- macOS support is planned for the future. Current development and verification are on Windows.
- The current exe is not code-signed.

### Support and Contact

- Bug reports and feature requests are expected to be handled through GitHub Issues.
- Official website: https://yoshimi-kudo.com/
- X: https://x.com/yoshimikudo

### License

The license policy has not been decided yet. Add a LICENSE file before making the repository public if reuse terms need to be clear.
