# test-perspective スキルを tpl-tools の Claude Code plugin として持つ

- **日付**: 2026-11-03
- **Issue**: [#39](https://github.com/kompiro/tpl-tools/issues/39)
- **PR**: （このドキュメントの PR）
- **ステータス**: 検討中
- **関連**: [ADR-27](../adr/27-generated-topic-grouped-index.md)（生成索引）、[ADR-31](../adr/31-checklist-markers-enforcement-status.md)（チェックリストのマーカー）、[ADR-35](../adr/35-index-check-off.md)（`indexCheck`）、hane [ADR-10](https://github.com/kompiro/hane/blob/main/docs/adr/10-tpl-integration-into-skills.md)（スキルを hane に置いた決定）、hane [ADR-55](https://github.com/kompiro/hane/blob/main/docs/adr/55-skill-deprecation-convention.md)（スキルの deprecate 運用）、hane 側の後続 [kompiro/hane#101](https://github.com/kompiro/hane/issues/101)

## 背景・課題

TPL を書くスキル `test-perspective` は kompiro/hane にある（`skills/test-perspective/{SKILL.md,TEMPLATE.md}`）。hane ADR-10 は、hane に tooling を持ち込まないために、スキルを hane に置き tooling を host 側に留めると決めた。当時 tooling は karasu の `tpl:*` スクリプトで、TPL の書き方を決めているのはスキルの側だった。

その後 tooling は tpl-tools に切り出され、書き方の規則の多くを tpl-tools が決めるようになった。スキルはそれを後から追いかけている:

- **索引**: ADR-27 で索引が生成ファイルになり、ADR-35 で PR が索引に触れない運用ができた。スキルは「一覧表に行を追加する」と書いたままで、kompiro/hane#99（kompiro/hane#100 で修正）まで気づかれなかった
- **チェックリストのマーカー**: ADR-31 の `checklistHeading` を設定した host では、`tpl validate` がその見出しの節と 1 つ以上の項目を求め、項目末尾の `[guard: \`path\`]` / `[judgment]` マーカーの形を検査する。スキルはこれを知らないので、自分の雛形の見出し（「チェックリスト」）で書いて節が無いと落とされるか、マーカーを付けずに書いて、守られている項目まで `unguarded` と表示される。`tpl validate` を自分で呼ぶと、必須の `--source-prefix` を渡さず usage error にもなる
- **id の既定**: tpl-tools の `idFormat` の既定は `date-sequence`（`TPL-YYYYMMDD-NN`）だが、スキルの既定は Issue 番号ベース（`TPL-<n>`）。スキルは config を読まずに自分の既定で書く
- **雛形が 2 つある**: このリポジトリの `docs/test-perspectives/TEMPLATE.md`（host へのコピー用）と hane の `skills/test-perspective/TEMPLATE.md` はすでに内容が違う（`id` の例、`known_consumers` の扱い、`discovered_from` の書き方）

規則を決める側と、規則を agent に伝える側が別のリポジトリにあるので、tpl-tools の変更ごとに hane へ 2 本目の PR が要り、それが漏れると気づくのは host で TPL を書いて落ちたときになる。

## 制約・前提

- tpl-tools は npm パッケージと standalone バイナリ（ADR-6）で配る。npm の tarball は `package.json` の `files`（`dist` / `LICENSE` / `README.md`）だけを含むので、リポジトリに `skills/` や `.claude-plugin/` を足しても tarball は変わらない
- Claude Code の plugin は git リポジトリのルートの `.claude-plugin/plugin.json` と `skills/<name>/SKILL.md` で成り立つ。marketplace（`marketplace.json`）は plugin を git の URL で指せる。hane の marketplace `kompiro-hane` は既にこの形で hane を指している
- host が使う CLI の版は host の lock file（または入れたバイナリ）で固定されるが、plugin は marketplace が指すリビジョンで更新される。**スキルと host の CLI は同じ版とは限らない**
- hane の `design-doc` / `acceptance-test` / `qa` は TPL を読む側（ID の引用、チェックリストの転記）として TPL に触れる。これらは `docs/test-perspectives/` の有無で動くか決まり（hane ADR-10）、CLI を必要としない

## 検討した選択肢

### 案1: hane に残し、ずれを検査で拾う

hane にスキルを置いたまま、tpl-tools の CI か hane の CI で「SKILL.md が config の全キーと全サブコマンドに触れているか」を検査する。

- 利点: 配布経路が変わらず、利用者の移行が要らない
- 欠点: 検査はずれを見つけるだけで、直す PR は相変わらず別リポジトリに要る。リポジトリをまたぐ検査は、どちらかの CI がもう一方を checkout する必要がある

### 案2: tpl-tools を Claude Code plugin にし、スキルを移す（Issue の提案）

`.claude-plugin/plugin.json` と `skills/test-perspective/` をこのリポジトリに置く。hane の marketplace に `tpl-tools` のエントリを足して配る。hane 側のスキルは ADR-55 に従って deprecate する（kompiro/hane#101）。

- 利点: 書き方に影響する tpl-tools の変更と、スキルの変更を同じ PR に入れられる。スキルは「host が `tpl:validate` を持っていれば」ではなく、`tpl validate` / `tpl regenerate` / `tpl related` を直接名指しできる。同じリポジトリ内なので、ずれの検査（後述）を vitest に置ける
- 欠点: 利用者は plugin を 1 つ追加で入れる必要がある。hane ADR-10 を一部覆す

### 案3: スキルを npm パッケージに同梱し、`tpl init` で host にコピーする

`files` に `skills/` を足し、`tpl init --skill` のようなコマンドで host の `.claude/skills/` にコピーする。

- 利点: スキルが host の CLI と同じ版になる
- 欠点: コピーした時点から host のファイルになり、tpl-tools を上げても誰かがコピーし直すまで古いまま。ずれの場所が hane から各 host に移るだけで、数はかえって増える。Claude Code 以外の利用者にも不要なファイルを配る

### 案4: スキル専用のリポジトリを作る

- 利点: npm パッケージと plugin の関心が分かれる
- 欠点: 規則を決める側（tpl-tools）と伝える側が別リポジトリという、今の問題がそのまま残る

## 比較

| | 同じ PR で直せるか | 版のずれ | 利用者の手間 |
| --- | --- | --- | --- |
| 案1 hane に残し検査 | いいえ（検出のみ） | スキルは hane、CLI は host | なし |
| 案2 tpl-tools の plugin | **はい** | スキルは tpl-tools の版、CLI は host | plugin を 1 つ追加 |
| 案3 npm 同梱・コピー | はい（tpl-tools 内では） | host がコピーし直すまで古い | 上げるたびにコピー |
| 案4 専用リポジトリ | いいえ | 案1 と同じ | plugin を 1 つ追加 |

## 現時点の方針

**案2** を採る。

1. **plugin の形**: リポジトリのルートに `.claude-plugin/plugin.json` を置き、plugin 名は `tpl-tools`（npm パッケージ名・リポジトリ名と揃える。コマンドは `/tpl-tools:test-perspective`）。`plugin.json` の `version` は `package.json` の `version` と同じにし、リリースの commit（`chore: release vX.Y.Z`）で一緒に上げる。一致は vitest で検査する
2. **スキルの移設**: hane の `skills/test-perspective/{SKILL.md,TEMPLATE.md}` を `skills/test-perspective/` に移す。最初の PR は移設に留め、本文の変更は host 依存の言い回しを CLI の名指しに変える程度にする（下の 3〜5 は同じ PR で行うが、規則の中身は変えない）。言語は日本語のまま（hane の本文と揃え、翻訳は別件）
3. **規則のずれを直す**: 移設と同じ PR で、背景に挙げたずれを直す
   - 採番: `tpl.config.json`（または host が `--config` で渡すファイル）の `idFormat` に従う。config が無いときは CLI の既定（`date-sequence`）に従う、と書く。Issue 番号ベースの優先順位（Issue → PR → ローカル採番）は `issue-number` のときの規則として残す
   - チェックリスト: config に `checklistHeading` があるときは、その見出しの節にチェックリストを書く。マーカーは、項目を実際に守っているファイルがあるとき（`[guard: \`path\`]`）か、プログラムでは判定できない項目のとき（`[judgment]`）だけ付ける。どちらでもない項目にはマーカーを付けず、`unguarded` のまま残す（ADR-31。マーカーの無い項目は有効で、守られていない項目に `[guard]` を付けるのはマーカーが無いより悪い）
   - 索引: kompiro/hane#100 の内容（生成索引は PR で触らない）を、`indexFile` / `indexCheck` の名前で書き直す
   - 検証の呼び方: スキルは `tpl validate` のフラグを自分で組み立てず、host が CI やパッケージの script で実行している呼び方（例: `pnpm tpl:validate`）をそのまま使う。host にそれが無く、自分で `tpl validate` を呼ぶときは、`checklistHeading` が設定されていれば `--source-prefix` が必須になる（無いと usage error）。その場合、渡す prefix は host のソースを置いている最上位ディレクトリ（`src` / `packages` / `scripts` など、guard が名指しうるもの）で、guard の path はそのいずれかの下に解決できなければならない。prefix が決められないときはユーザーに尋ねる
4. **雛形を 1 つにする**: `skills/test-perspective/TEMPLATE.md` を正とし、`docs/test-perspectives/TEMPLATE.md` は削除して README からスキルの雛形を指す。host へのコピー用という役割は、スキルの雛形をコピーすれば満たせる
5. **版のずれへの備え**: スキルは host の CLI の版を前提にせず、host の状態を見て振る舞いを決める（config にどのキーがあるか、索引のヘッダ、`tpl` が使えるか）。ある版で入った機能に頼る箇所には「tpl-tools vX 以降」と書き、それより古い CLI での代わりの手順を添える
6. **ずれの検査**: vitest に次を確かめるテストを置く
   - `src/config.schema.json` の全キーと CLI の全サブコマンドが `SKILL.md` に出てくる。新しいキーやサブコマンドを足した PR は、スキルに書き足さない限り落ちる
   - schema で `default` を持つキー（`idFormat` の `date-sequence`、`indexCheck` の `true`）は、その既定値も `SKILL.md` に書かれている。既定を変えた PR はスキルの記述も直さない限り落ちる

   名前と既定値の出現しか見ないので、規則の意味（マーカーを付ける条件など）のずれは捕まえない。それは同じ PR でスキルを直す運用とレビューで拾う。CONTRIBUTING には「TPL の書き方に影響する変更は同じ PR でスキルを直す」と 1 行足す
7. **配布**: hane の `.claude-plugin/marketplace.json` に `tpl-tools` のエントリを足す。これは hane 側の作業で、kompiro/hane#101 で行う。tpl-tools は自前の marketplace を持たない
8. **ADR**: 実装後、このドキュメントを tpl-tools の ADR-39 に昇格する。hane ADR-10 を一部覆す ADR は hane 側（kompiro/hane#101）で書く

hane 側の順序: tpl-tools の plugin が marketplace から入れられるようになってから、hane のスキルを deprecate する（kompiro/hane#101）。それまで hane のスキルは今のまま動く。

## 未解決の問い

- marketplace のエントリで plugin のリビジョンをタグに固定できるか（git の URL に `ref` を指定できるか）。できるなら、リリースのタグを指してスキルの更新をリリースに揃える。できないなら default branch を指し、5 の「版を前提にしない」で吸収する
- スキルの規則（採番・マーカー・索引）を機械可読な contract に書き、`SKILL.md` の該当節をそこから生成する案もある。規則の意味のずれまで捕まえられるが、生成の仕組みと contract の形式を新たに持つことになる。6 の検査で足りなくなったら検討する
- CLI に `tpl --version` が無い。スキルが host の CLI の版を確かめたい場面が出たら足す（今回は 5 の方針で不要と見ている）
