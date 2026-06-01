# AutoLooper Release Plan

## 結論

初期リリースは **Git + GitHub Releases + portable exe + SHA256 checksum + 手動更新** を推奨します。

Gitはソースコードと変更履歴の管理に使い、配布はGitHub Releasesで行います。現在のAutoLooperはWindows portable exeを生成する構成なので、最初から自動更新やインストーラーに寄せるより、手動配布で実運用を固める方が現実的です。

## 推奨する段階

| 段階 | 方法 | 目的 | 採用タイミング |
| --- | --- | --- | --- |
| 1 | GitHub Releasesにportable exeを添付 | 最小コストで配布 | 初回リリース |
| 2 | アプリ内に「更新確認」リンクを追加 | ユーザーが最新版を見つけやすくする | 配布が始まった後 |
| 3 | electron-updaterによる自動更新 | 更新忘れを減らす | 利用者が増えた後 |
| 4 | 署名・インストーラー・macOS対応 | 警告低減と正式配布 | 公開範囲を広げる時 |

## 利点

- どのコードからどのexeを作ったか追跡できる。
- タグとリリースノートでバージョン管理しやすい。
- exe、checksum、既知の問題を1か所にまとめられる。
- バグが出た場合に前バージョンへ戻しやすい。
- 将来のGitHub Actions、自動更新、macOS配布へ拡張しやすい。

## リスクと対策

| リスク | 内容 | 対策 |
| --- | --- | --- |
| 秘密情報の混入 | APIキー、個人パス、テスト音源を誤ってpushする | `.gitignore`確認、コミット前レビュー |
| 巨大ファイルの混入 | `release/`, `node_modules/`, 音源データをcommitする | Git管理対象から除外 |
| 未署名exe警告 | Windows SmartScreenで警告が出る可能性 | 初期は注意書き、正式配布時にコード署名検討 |
| リリースミス | 古いexeやchecksum不一致を配布する | draft releaseで添付確認後にpublish |
| 更新忘れ | ユーザーが古いexeを使い続ける | まず更新確認リンク、後で自動更新 |

## 初回リリース手順

1. `package.json` の `version` を決める。
2. `npm.cmd test` を実行する。
3. `npm.cmd run build` を実行する。
4. `npm.cmd run dist` でportable exeを作る。
5. 生成されたexeを起動確認する。
6. `Get-FileHash -Algorithm SHA256 "release\\AutoLooper 0.1.0.exe"` でchecksumを作る。
7. Gitでコミットする。
8. `v0.1.0` のようなタグを作る。
9. GitHub Releasesでdraft releaseを作る。
10. exe、checksum、リリースノートを添付する。
11. 内容確認後にpublishする。

## 更新方針

- パッチ修正: `0.1.0` -> `0.1.1`
- 機能追加: `0.1.0` -> `0.2.0`
- 保存形式や互換性を壊す変更: `1.0.0` -> `2.0.0`

リリースノートには、変更内容、修正バグ、既知の問題、対応OS、未署名である場合の注意を記載します。

## 自動更新を入れる場合

自動更新は後回しでよいです。導入時は、portable exeのままではなく、WindowsはNSIS系インストーラーへ寄せる前提で検討します。

必要になるもの:

- `electron-updater`
- electron-builderの`publish`設定
- `latest.yml`などの更新メタデータ
- アプリ側の更新チェックUI
- 署名方針
- GitHub Releaseをpublished状態で運用するルール

## macOS対応時の注意

macOSで正式配布する場合は、署名とnotarizationを前提にします。Windowsと同じ配布手順では済まないため、別途ビルド環境、Apple Developer Program、証明書管理が必要です。

## 参考

- GitHub Docs: About releases  
  https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases
- GitHub Docs: Managing releases  
  https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository
- electron-builder: Auto Update  
  https://www.electron.build/auto-update
- Electron: Code Signing  
  https://www.electronjs.org/docs/latest/tutorial/code-signing
- Microsoft Learn: SmartScreen reputation  
  https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation

