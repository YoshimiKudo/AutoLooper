# AutoLooper Git / GitHub Release ガイド

この資料は、AutoLooper を Git で管理し、GitHub Releases で配布するための基本方針と手順をまとめたものです。

## 1. 目的

Git はソースコードの変更履歴を残すための仕組みです。GitHub はその履歴をオンライン上に置き、バックアップ、共有、リリース配布に使えるサービスです。

AutoLooper では、次の目的で GitHub を使います。

- ソースコードの履歴を残す
- どのコードからどの exe を作ったか追跡する
- GitHub Releases に exe を添付して配布する
- バグ修正や機能追加の単位をバージョンとして管理する

例えるなら、Git は「制作ノート」、GitHub は「オンライン保管庫」、GitHub Releases は「完成品を置く配布棚」です。

## 2. 基本用語

### repository

リポジトリは、プロジェクト一式を管理する単位です。AutoLooper の場合、`package.json`、`src`、`README.md` などを含むフォルダ全体が 1 つのリポジトリになります。

### commit

コミットは、ある時点の変更内容を保存する記録です。ゲームのセーブデータに近いものです。

良いコミットメッセージの例:

```powershell
git commit -m "Add loop playback support"
git commit -m "Fix README encoding"
git commit -m "Prepare initial release"
```

### branch

ブランチは、作業の流れを分ける仕組みです。通常は `main` を正式な履歴として使います。大きな修正を試す場合は別ブランチを作ると、正式版を壊さずに作業できます。

### tag

タグは、特定のコミットに名前を付ける仕組みです。リリースでは `v0.1.0` のようなタグを使い、「この時点のコードがバージョン 0.1.0 です」と示します。

### GitHub Releases

GitHub Releases は、タグに対して配布物を添付できる機能です。AutoLooper ではここに Windows 用の exe を置きます。

## 3. 公開 / 非公開の判断

### 非公開が向く場合

- まだ開発途中で外部に見せたくない
- 検出アルゴリズムや UI 実装を資産として隠したい
- 配布先を限定したい
- ライセンス方針が未確定
- 公開前チェックが完了していない

### 公開が向く場合

- ソースコードを見せても問題ない
- ポートフォリオや実績として公開したい
- バグ報告や改善提案を外部から受けたい
- README、LICENSE、ビルド手順が整っている
- 音源、動画素材、ローカルパス、秘密情報が履歴に含まれていない

初回は非公開リポジトリで運用し、公開準備が整ってから公開へ切り替える方法が安全です。

## 4. Git 管理に入れるもの / 入れないもの

### 入れるもの

- `src/`
- `tests/`
- `README.md`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `vite.config.ts`
- アプリのアイコンなど、配布に必要な軽量アセット

### 入れないもの

- `node_modules/`
- `release/`
- `dist-electron/`
- `dist-renderer/`
- `outputs/`
- `asseet/`
- 作業用動画、BGM、テスト音源
- `.env`
- API キー、トークン、認証情報

これらは `.gitignore` で除外します。大きなファイルや個人データを Git 履歴に入れると、後から消すのが難しくなります。

## 5. 初回リリース手順

### 1. 状態確認

```powershell
git status --short --branch
```

意図しないファイルが含まれていないか確認します。

### 2. テスト

```powershell
npm.cmd test
```

### 3. ビルド

```powershell
npm.cmd run build
```

### 4. exe 生成

```powershell
npm.cmd run dist
```

生成物は `release` フォルダに出力されます。

### 5. exe 起動確認

生成された exe を起動し、最低限アプリが開くことを確認します。

### 6. コミット

```powershell
git add .
git commit -m "Initial AutoLooper release"
```

### 7. タグ作成

```powershell
git tag -a v0.1.0-beta -m "AutoLooper v0.1.0 beta"
```

### 8. GitHub へ push

```powershell
git push -u origin main
git push origin v0.1.0-beta
```

### 9. GitHub Release 作成

GitHub Releases で `v0.1.0-beta` を選び、生成済み exe を添付します。

リリースノートには次を書きます。

- バージョン
- 主な機能
- 対応 OS
- 既知の注意点
- 未署名 exe であること

## 6. バージョン番号の考え方

AutoLooper では、次のように番号を上げると管理しやすくなります。

- `0.1.0` -> `0.1.1`: 小さな修正
- `0.1.0` -> `0.2.0`: 機能追加
- `1.0.0` -> `2.0.0`: 互換性を壊す大きな変更

初期段階では `v0.1.0-beta` のように beta を付けると、正式版前の検証版であることが分かりやすくなります。

## 7. リリースノート例

```markdown
# AutoLooper v0.1.0-beta

初回ベータリリースです。

## 主な機能

- WAV / AIFF / Ogg Vorbis の読み込み
- ゲーム音楽向けループ候補の自動検出
- 波形エディタでのループ開始 / 終了編集
- リストエディタでの表形式編集
- ループ付きコピー保存

## 対応環境

- Windows

## 注意

- この exe はコード署名されていません。
- Windows SmartScreen の警告が出る場合があります。
- macOS 対応は将来予定です。
```

## 8. 公開前チェック

公開前には、最低限次を確認します。

```powershell
git status --short --branch
git ls-files
npm.cmd test
npm.cmd run build
```

確認ポイント:

- 不要な音声ファイルや動画素材が含まれていない
- `node_modules` や `release` が含まれていない
- ローカルパスや個人情報が含まれていない
- トークン、API キー、認証情報が含まれていない
- README が文字化けしていない
- LICENSE 方針が決まっている

## 9. LICENSE について

公開リポジトリにする場合は、LICENSE を置くことを推奨します。

LICENSE がない場合、第三者はソースコードを読めても、再利用・改変・再配布してよいか判断できません。外部に使ってもらいたいなら MIT License などを検討します。ソースの再利用を許可したくないなら、公開リポジトリではなく非公開リポジトリのまま運用する方が明確です。

## 10. 今後の拡張

利用者が増えた場合は、次を検討します。

- GitHub Actions で自動ビルド
- Release 作成の自動化
- SHA256 チェックサム添付
- Windows コード署名
- macOS 用ビルドと notarization
- アプリ内の更新確認

最初からすべて自動化するより、初回は手動リリースで手順を固め、その後に自動化する方が安全です。
