# テスト観点ライブラリ（Test Perspective Library, TPL）

> Reference template shipped with `@kompiro/tpl-tools`. Copy this file (and
> [`TEMPLATE.md`](./TEMPLATE.md)) into your project's
> `docs/test-perspectives/` directory and adapt the topic vocabulary,
> file paths, and tooling commands to your setup.

## 目的

プロジェクトで **再発しうる失敗パターン** を、構造化された観点として蓄積する。新機能の Design Doc 作成時や受け入れテスト設計時に、これらの観点を参照することで「同じ shape の bug を 2 回起こさない」運用を支える。

## ADR との違い

- **ADR**: 判断の記録（「私たちはこう判断した」）
- **TPL**: 検証すべき観点の集約（「これを検証すべき」）

両者は frontmatter の `topic` / `scope.packages` を共有しており、同じトピックで横串検索することで「過去の判断」と「検証すべき観点」を同時に発見できる。

### 観点の起源 — retrospective と proactive

TPL は **2 つの起源** から生まれる:

- **Retrospective（事後）** — 過去の `bug` / `test-infra` Issue から、実際に起きた失敗を一般化する
- **Proactive（事前）** — ADR / Design Doc / コンセプトメモのようなアーキテクチャ原則から、**原則が破られたときに起きるであろう失敗** を予測して観点化する

どちらも同じ 3-Yes ルール（後述）と同じ運用ルールに乗る。起源は frontmatter の `discovered_from` を見れば分かる（`issue:` か `root_cause_file:` か）。

---

## エントリの構造

各 TPL は 1 ファイル = 1 観点で、ファイル名規約は reference-data JSON の `idFormat` で決まる:

| `idFormat` | Filename | Frontmatter `id` | Notes |
|---|---|---|---|
| `date-sequence` (default) | `TPL-YYYYMMDD-NN-<slug>.md` | `TPL-YYYYMMDD-NN` | Zero-padded `NN` resets to `01` each day |
| `issue-number` | `TPL-<n>-<slug>.md` | `TPL-<n>` | No zero padding. Prefer **Issue 番号 → PR 番号 → ローカル採番（既存最大+1）** when assigning `<n>` |

Pick one format per project; mixing is not supported.

書式は [`TEMPLATE.md`](./TEMPLATE.md) を参照。

### Frontmatter

```yaml
---
id: TPL-YYYYMMDD-NN
title: "観点を1行で表現"
status: active            # active | deprecated
date: YYYY-MM-DD
applicable_to:
  - "再利用可能な抽象パターン（例: 共有 store から購読するすべての画面）"
  - "1 パターン 1 行に分解する（複数の抽象パターンに当てはまるなら複数行）"
known_consumers:           # optional — この観点が適用されると判明している具体的な consumer
  - timeline-view          # kebab-case の feature / module 名（grep 可能な形）
discovered_from:
  - issue: "#1234"
  - root_cause_adr: "ADR-..."                # optional
  - root_cause_file: "path/to/file.ts:LINE"  # optional
related_to:
  - TPL-...
topic: <your-topic>        # reference-data の "topics" のいずれか
scope:
  packages: []
---
```

各フィールドの意図:

- **`applicable_to`** — この観点が適用される **抽象パターン**。再利用可能な抽象度で書く。1 行 = 1 パターンに分解し、複数パターンに当てはまる観点なら複数行で並べる。consumer の具体名はここに書かない（そちらは `known_consumers`）
- **`known_consumers`** — この観点が適用されると判明している **具体的な consumer**（feature / module / area など）。kebab-case で、grep で検索しやすい形にする。consumer 空間が広すぎて列挙が無意味な場合は省略する
- **`topic`** — プロジェクト固有の controlled vocabulary。reference-data JSON の `topics` で定義する。
- **`scope.packages`** — モノレポなら `packages/` 配下のディレクトリ名。`--packages-root` を指定すれば validator がチェックする。非モノレポでは空配列 or 任意のラベル

### 本文セクション

1. **観点** — 何を検証すべきかを、再利用可能な抽象度で記述する
2. **想定される失敗モード** — この観点が見落とされた場合に、どのような形で失敗が現れるか
3. **チェックリスト** — 新機能の実装/修正時に確認する項目。**3〜5項目に絞る**（多すぎると使われない）
4. **既知の対処パターン** — 過去にこの問題を解決した方法
5. **関連テスト** — この観点を検証する既存テストのパス

---

## 運用ルール

### 新規エントリの追加タイミング — 3-Yes ルール

`bug` または `test-infra` ラベルが付いた Issue が起票されたとき、以下のすべてが Yes なら新規 TPL として起こす:

1. 同じ root cause が **別の機能でも発生しうる** か?
2. 構造的なパターンとして **再発する可能性がある** か?
3. 既存の TPL でカバーされていない観点か?

1 つでも No なら個別 Issue として処理して TPL は作らない。

### 既存エントリの更新

新しい Issue が既存 TPL のパターンに該当する場合、その TPL の `discovered_from` に Issue を追記する。チェックリストや「既知の対処パターン」の更新が必要なら、それも併せて行う。

### deprecated への移行

実装の構造変更などで、ある観点が原理的に発生しなくなった場合、`status` を `deprecated` に変更する。エントリ自体は **削除しない** — なぜ deprecated にしたかを末尾に追記する（後から「この観点はなぜ消えたのか」を辿れるようにするため）。validator は `status: deprecated` のエントリ本文に `deprecated` の語を含む rationale を要求する。

## TPL のライフサイクル

```
concept (Design Doc / ADR / コンセプトメモ)
   │
   │   原則を実装に落とすときに違反しうる観点を抽出
   ▼
proactive TPL  ← 開発前に書く（予防可能な学習）
   │
   ▼
development (Design Doc + 実装)
   │
   ▼
bug (proactive TPL でカバーできなかった失敗)
   │
   │   実際に起きた失敗を一般化
   ▼
retrospective TPL  ← bug 修正と同じ PR で書く（不可避な学習）
```

- **proactive TPL** は **予防可能** な学習。書ければ bug を未然に防げる
- **retrospective TPL** は **不可避** な学習。起きてからしか書けないが、起きたら必ず書く

retrospective TPL を書くたびに「**この観点を proactive TPL として書いておけたか?**」を自問する。

## 参照タイミング

- **Design Doc 作成時**: 該当する `topic` の **既存 TPL** を一覧し、必要ならチェックリストを設計に反映する (`npx tpl related <topic>` が使える)
- **新機能の実装時**: 受け入れテストの項目を作る前に該当 TPL のチェックリストを確認する
- **bug 修正時**: 同じパターンの TPL がすでに存在しないか確認し、あれば `discovered_from` に追記する。なければ 3-Yes ルールで retrospective TPL の新規作成を検討する

## ツール

```sh
npx tpl validate \
  --tpl-dir docs/test-perspectives \
  --config adr.config.json            # reference-data: topics + idFormat
npx tpl related <topic>               # Design Doc 用 markdown を出力
npx tpl review-body                   # 定期 deprecation review issue の本文を生成
```

Wire `tpl validate` into a pre-push hook and/or CI so frontmatter / ID 形式 / topic 語彙 / README 一覧の整合性が機械的にチェックされる。

## 一覧

現時点で active な TPL は以下:

| ID | タイトル | topic | 起源 |
|---|---|---|---|
| _(no entries yet)_ | | | |
