## Download / ダウンロード

**macOS Universal DMG**: [AutoLooper.0.4.2.mac.dmg](https://github.com/YoshimiKudo/AutoLooper/releases/download/v0.4.2-macos-experimental/AutoLooper.0.4.2.mac.dmg)

**macOS Universal ZIP**: [AutoLooper.0.4.2.mac.zip](https://github.com/YoshimiKudo/AutoLooper/releases/download/v0.4.2-macos-experimental/AutoLooper.0.4.2.mac.zip)

**Checksum**: [SHA256SUMS-mac.txt](https://github.com/YoshimiKudo/AutoLooper/releases/download/v0.4.2-macos-experimental/SHA256SUMS-mac.txt)

## Important Notes / 重要な注意

This is an unsigned macOS experimental build. The author does not currently have a Mac test environment, so this build has not been manually verified on real macOS hardware.

このmacOS版は未署名の実験版です。作者は現在Mac実機の検証環境を持っていないため、実機での手動検証は行っていません。

Use this build only if you accept that it may fail to launch or may have macOS-specific bugs.

## How to Open / 起動方法

macOS Gatekeeper may block this app because it is unsigned.

1. Download the DMG or ZIP.
2. Open or extract the app.
3. If macOS blocks the app, try right-clicking the app and selecting `Open`.
4. If it is still blocked, check `System Settings > Privacy & Security`.

未署名アプリのため、macOSのGatekeeperで起動が止められる場合があります。

If the DMG download fails in Safari, try downloading the ZIP instead.

SafariでDMGのダウンロードに失敗する場合は、ZIP版を試してください。

To quit the app on macOS, use `AutoLooper > Quit AutoLooper` or `Cmd+Q`. Closing the window may keep the app running, which is normal macOS behavior.

macOSでアプリを終了する場合は、`AutoLooper > Quit AutoLooper` または `Cmd+Q` を使ってください。ウィンドウを閉じてもアプリが起動したままになるのはmacOSの通常動作です。

## Main Features / 主な機能

- WAV / AIFF / Ogg Vorbis / MP3 / FLAC / Opus import
- Automatic loop detection with `Normal / Deep / Custom`
- Waveform loop marker editing
- Loop playback and `Check Loop`
- Loop marker saving for supported metadata formats
- MP3 marker editing inside the app, with save warning because MP3 marker embedding is not supported

## Changes in v0.4.2 / v0.4.2 の変更点

- Explicitly denies Electron media permission checks so microphone/camera access is not allowed.
- AutoLooper does not use microphone recording.

- Electronのメディア権限チェックでマイク/カメラ権限を許可しないようにしました。
- AutoLooperはマイク録音機能を使いません。

## Feedback / 不具合報告

Please report macOS launch and behavior issues here:

[Create a macOS issue](https://github.com/YoshimiKudo/AutoLooper/issues/new?template=macos-test-report.yml)

報告時は、macOSバージョン、Intel / Apple Silicon、使用したファイル名、起動できたか、どの操作で問題が出たかを書いてください。

## Verification / 検証

- GitHub Actions macOS runner: `npm test`
- GitHub Actions macOS runner: `npm run dist:mac`
- No manual real-Mac verification by the author
