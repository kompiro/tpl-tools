# Node 非依存の standalone バイナリ配布

- **日付**: 2026-06-08
- **Issue**: なし
- **PR**: #5
- **ステータス**: 検討中
- **関連**: adr-tools 側の同名 Design Doc（同一パターンを共有）

## 背景・課題

`@kompiro/tpl-tools` は現状 GitHub Packages (`npm.pkg.github.com`) の npm パッケージとして配布しており、`tpl` コマンドの bin は `#!/usr/bin/env node` で Node ランタイムに依存している。

利用したい環境がすべて Node を持つわけではない:

- **他プロジェクト / 他人への配布** — Node ツールチェーンを前提にできない
- **Go 開発などの devcontainer** — Node を入れていない開発環境でも `tpl` / `adr` を使いたい

Node や node_modules のセットアップなしに `tpl` コマンドを実行できる配布手段が欲しい。adr-tools と対で使われるため、両ツールで同一の配布パターンを揃える。

## 制約・前提

- 本ツールは **ファイル I/O (`node:fs` / `node:path`) と `js-yaml` のみ**に依存する小さな純 CLI（~296 LOC）。ネイティブアドオン・ネットワーク・子プロセスは使わない
- TypeScript / ESM (`type: module`)。エントリは `src/cli/index.ts`、bin 名は `tpl`
- 既存の npm 配布は **継続する**（Node ユーザーの体験を壊さない）。バイナリ配布はあくまで追加
- 配布先は linux / macOS / Windows、x64 / arm64 を想定

## 検討した選択肢

### 案1: Bun `bun build --compile`（本命）

`bun build src/cli/index.ts --compile --target=<t> --outfile <name>` で Bun ランタイムを同梱した単一実行ファイルを生成する。

- メリット
  - `node:fs/path` をネイティブ対応、`js-yaml` も自動バンドル。1 コマンドで完結
  - `--target=bun-{linux,darwin,windows}-{x64,arm64}` でクロスコンパイル可
  - 既存ソース構成に手を入れずに済む
  - **検証済み**: 本リポジトリのソースを native にコンパイルし、実 TPL セットに対し `Validated 16 TPL(s)` を Node 無しで確認（`bun install` でのデフォルト依存導入のみ前提）
- デメリット
  - バイナリが **~90MB**（Bun ランタイム同梱が下限。アプリが小さいため `--minify --bytecode` でも変わらない）

### 案2: Deno `deno compile`

- メリット: `node:` 指定子・npm 依存対応、クロスコンパイル可
- デメリット: バイナリ ~80MB、権限フラグの作り込みが追加で必要。Bun 比で本ツールに対する優位が薄い

### 案3: Node SEA (Single Executable Applications)

- メリット: 公式ランタイムを使う
- デメリット: ESM → 単一 CJS 化 → blob → postject → codesign と多段で複雑。各プラットフォームの `node` バイナリ用意が必要。実験的

### 案4: Go / Rust への書き直し

- メリット: 数 MB の完全静的バイナリ、ランタイム不要
- デメリット: 全面移植。~296 LOC とはいえ adr-tools と歩調を合わせる必要があり、労力に見合わない

## 比較

| 観点 | 案1 Bun | 案2 Deno | 案3 Node SEA | 案4 Go/Rust |
|---|---|---|---|---|
| 実装コスト | 低（1 コマンド） | 低〜中 | 高（多段） | 最高（全面移植） |
| クロスコンパイル | ◎ | ◎ | △ | ◎ |
| `node:` API 対応 | ◎ | ○ | ◎ | N/A |
| バイナリサイズ | ~90MB | ~80MB | ~80MB+ | 数MB |
| ソース改変 | ほぼ不要 | 小 | 中 | 全面 |
| 検証済み | ✅ | – | – | – |
| adr-tools との一貫性 | ◎ | ○ | △ | △ |

サイズ以外で Bun が劣る点がなく、adr-tools と同一パターンに揃えられ、実機検証も済んでいるため案1 を採る。

## 現時点の方針

**案1 Bun `--compile`** を採用し、既存 npm 配布に **追加**する形で standalone バイナリを提供する。adr-tools と同一のビルド・リリース・install パターンを踏襲する。

### ビルド

`package.json` にビルドスクリプトを追加し、エントリ `src/cli/index.ts` を以下 5 ターゲットへコンパイルする。

| target | 成果物名 |
|---|---|
| `bun-linux-x64` | `tpl-linux-x64` |
| `bun-linux-arm64` | `tpl-linux-arm64` |
| `bun-darwin-x64` | `tpl-darwin-x64` |
| `bun-darwin-arm64` | `tpl-darwin-arm64` |
| `bun-windows-x64` | `tpl-windows-x64.exe` |

### リリースパイプライン

GitHub Actions をタグ push (`v*`) で発火 → `oven-sh/setup-bun` で Bun を固定バージョン導入 → 5 ターゲットをビルド → SHA256 チェックサム生成 → `gh release` にアセットアップロード。既存の npm publish ワークフローと並走させる。

### 利用側の入手経路

- **install スクリプト**: `curl -fsSL https://raw.githubusercontent.com/kompiro/tpl-tools/main/install.sh | sh`
  - `uname` で OS/arch を判定 → 最新 Release（または `TPL_VERSION` 指定）から該当アセットを DL → SHA256 検証 → `~/.local/bin/tpl` に配置・`chmod +x`（sudo 不要）
  - install.sh は adr-tools と **別々**に用意する（共通スクリプトには寄せない）。devcontainer では両者の `RUN` を 2 行並べて入れる
- **devcontainer**: `Dockerfile` に install スクリプトの `RUN` を 1 行追加して導入（adr-tools の行と並べて 2 ツールを入れる）。devcontainer feature は当面用意しない
- **設定ファイル解決**: `--config` で渡す設定ファイル（adr.config.json 共有）は **CWD 基準のまま**とする。バイナリ配布でも問題なく解決できることは検証済み。利用ガイドでこの前提を明示する
- **Homebrew tap**（任意・後追い）: `kompiro/tap`

### 留意点

- **Windows**: コード署名なしだと SmartScreen 警告。当面許容
- **再現性**: `setup-bun` で Bun バージョンを固定する
- **adr-tools との同期**: ビルドスクリプト・release workflow・install.sh は両リポジトリでほぼ同形。仕様変更時は両方を揃える

### 利用者リポジトリ（hato 等）への影響

hato は Node プロジェクトのため変更不要（`pnpm tpl:validate` のまま）。本バイナリ配布は Node 非依存環境向けの追加であり、既存利用者の pre-push / CI には影響しない。
