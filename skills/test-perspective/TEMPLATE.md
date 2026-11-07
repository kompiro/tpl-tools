<!--
TPL（Test Perspective Library）記録の雛形。test-perspective スキルが使い、host に
コピーして使う雛形も兼ねる。

使い方:
1. このファイルを `docs/test-perspectives/` に、`idFormat` の形のファイル名（下記。`TPL-YYYYMMDD-NN-<slug>.md` か `TPL-<n>-<slug>.md`）でコピーする。
2. コピー先で本 HTML コメントブロック（先頭）を削除し、frontmatter と各節を埋める。
3. `discovered_from` の `issue:` は起源を問わず残し、proactive なら `root_cause_*` の該当行も残す。

規約メモ:
- id とファイル名の形式は config の `idFormat` で決まる（`tpl validate` が一致を検査する）:
  - `date-sequence`（config が無いときの既定）: id `TPL-YYYYMMDD-NN`、ファイル名 `TPL-YYYYMMDD-NN-<slug>.md`。`NN` はゼロ埋めで日ごとに `01` から
  - `issue-number`: id `TPL-<n>`、ファイル名 `TPL-<n>-<slug>.md`（ゼロ埋めなし）。`<n>` は Issue → PR → ローカル採番の順
  採番後はリネームしない。下の雛形の `TPL-<id>` は、id 全体（`TPL-YYYYMMDD-NN` か `TPL-<n>`）で置き換える。
- 言語: 日本語本文 + 英語の識別子・固有名詞。
- `topic` は必須。config の `topics` があればそのどれか。無ければ free-form の小文字 kebab。
- `applicable_to` と `discovered_from` は必須で空にしない。`discovered_from` に書けるキーは
  `issue` / `root_cause_adr` / `root_cause_file`。
- `scope.packages` には実在するパッケージ / ソースルートのみ書く（`tpl validate --packages-root` が検査する）。
  `scope.paths` は本文がどのファイルも名指さない TPL のための glob（tpl-tools v0.0.14 以降。`*` / `**` / `?` のみ）。
- `status` は `active` | `deprecated`。deprecate してもファイルは消さず、末尾に `deprecated` の語を含む rationale を足す。
- config に `checklistHeading` がある host では、チェックリストの見出しをその文字列にする。
  マーカーは項目を守っているファイルがあるとき（`` [guard: `path`] ``）か、プログラムでは
  判定できないとき（`[judgment]`）だけ付ける。どちらでもない項目は印なし（unguarded）のまま。
- 作成後は `tpl validate`（host が script で包んでいればそちら）を実行する。詳細は SKILL.md。
-->

---
id: TPL-<id>             # ファイル名の id と一致。TPL-YYYYMMDD-NN（date-sequence、既定）か TPL-<n>（issue-number）
title: "観点を1行で表現"
status: active            # active | deprecated
date: YYYY-MM-DD          # 作成日
applicable_to:
  - "再利用可能な抽象パターン（例: 設定値を消費する機能）。1 行 = 1 パターン。複数パターンに当てはまるなら複数行"
# known_consumers:        # optional — この観点が適用されると判明している具体的 consumer。grep 可能な kebab-case
#   - feature-name
discovered_from:
  - issue: "#N"                              # TPL を起こした作業の Issue。proactive でも書き、番号も通常ここから採る（作業に Issue が無いときだけ省く）
  # - root_cause_adr: "ADR-<番号>"            # proactive（ADR 起源）の場合に追加
  # - root_cause_file: "docs/concepts.*"     # proactive（原則ファイル起源）の場合に追加
  # - root_cause_file: "path/to/file.ts:symbol"   # 行番号は検査できないので書かない
related_to: []           # optional — 同ディレクトリの実在 TPL の id のみ（例: [TPL-123]）
topic: <controlled-vocabulary>   # config の topics があればそのどれか、無ければ free-form kebab
scope:
  packages: []            # 実在するパッケージ / ソースルートのみ（例: [core]）
  # paths:                # optional — 本文がファイルを名指さない TPL の glob（tpl-tools v0.0.14 以降）
  #   - ".github/workflows/*.yml"
---

# TPL-<id>: 観点を1行で表現

## 観点

何を検証すべきかを、再利用可能な抽象度で記述する。具体実装に閉じた書き方ではなく、別の機能でも適用できる原則として書く。

## 想定される失敗モード

この観点が見落とされた場合に、どのような形で失敗が現れるか。具体例があればそれも記述する。

## チェックリスト

新機能の実装/修正時に確認する項目。**3〜5 項目に絞る**（多すぎると使われない）:

- [ ] チェック項目1
- [ ] チェック項目2
- [ ] チェック項目3

## 既知の対処パターン

過去にこの問題を解決した方法。なければ「（未確立）」と記す。

## 関連テスト

この観点を検証する既存テストのパス。なければ「（なし）」と記す。
