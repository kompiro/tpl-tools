---
# `id` の形式は reference-data JSON の `idFormat` で決まる:
#   - `date-sequence`  (default) → `TPL-YYYYMMDD-NN`
#   - `issue-number`              → `TPL-<n>`（ゼロ埋めなし）
id: TPL-YYYYMMDD-NN
title: "観点を1行で表現"
status: active
date: YYYY-MM-DD
applicable_to:
  - "再利用可能な抽象パターン（1 行 1 パターン）"
# known_consumers:           # optional — 既知の具体的 consumer。grep 可能な kebab-case
#   - feature-name
discovered_from:
  - issue: "#NNNN"
  # - root_cause_adr: "ADR-..."
  # - root_cause_file: "path/to/file.ts:LINE"
related_to: []
# topic must match one of the values declared in your reference-data JSON ("topics")
topic: <your-topic>
scope:
  packages: []
---

# TPL-YYYYMMDD-NN: 観点を1行で表現

## 観点

何を検証すべきかを、再利用可能な抽象度で記述する。具体実装に閉じた書き方ではなく、別の機能でも適用できる原則として書く。

## 想定される失敗モード

この観点が見落とされた場合に、どのような形で失敗が現れるか。具体例があれば、それも記述する。

## チェックリスト

新機能の実装/修正時に、以下を確認する:

- [ ] チェック項目1
- [ ] チェック項目2
- [ ] チェック項目3

3〜5項目に絞る。多すぎると使われない。

## 既知の対処パターン

過去にこの問題を解決した方法があれば、ここに記述する。なければ「（未確立）」と記す。

## 関連テスト

この観点を検証する既存のテストがあれば、ここにパスを記述する。

---

## Frontmatter reference

- `status` is one of `active` | `deprecated`. Switch to `deprecated` when the pattern is structurally extinct; keep the file and append a rationale below mentioning "deprecated" so the validator records it.
- `topic` is required and must be one of the values declared in your reference-data JSON (`topics`).
- `id` must match the filename-derived id per `idFormat`:
  - `date-sequence` (default): id `TPL-YYYYMMDD-NN`, filename `TPL-YYYYMMDD-NN-<slug>.md`.
  - `issue-number`: id `TPL-<n>`, filename `TPL-<n>-<slug>.md` (no zero padding). `<n>` is typically the originating GitHub Issue or PR number.
- `applicable_to` is required and non-empty: one re-usable pattern per line.
- `discovered_from` is required and non-empty. Allowed keys: `issue`, `root_cause_adr`, `root_cause_file`.

Run `npx tpl validate` to check schema, filename, and README-index consistency locally.
