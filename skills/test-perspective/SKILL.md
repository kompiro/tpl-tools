---
name: test-perspective
description: >
  Create, update, or deprecate Test Perspective Library (TPL) records in docs/test-perspectives/.
  Trigger when the user says: "テスト観点", "観点ライブラリ", "TPL", "観点を追加", "TPLを起こす",
  "TPLをdeprecate", "test perspective", "add TPL", "deprecate TPL", or similar phrases requesting
  test-perspective record maintenance.
---

# Test Perspective (TPL) Skill

再発しうる失敗パターンを、構造化された「観点」として `docs/test-perspectives/` に蓄積・更新・deprecate する。
1 観点 = 1 ファイル。DesignDoc 作成時・新機能実装時・bug 修正時に該当 `topic` / `scope.packages` の観点が参照される状態を作るのが目的。

TPL の形式（frontmatter・id・索引・チェックリストのマーカー）は `@kompiro/tpl-tools` の `tpl` CLI が検査する。このスキルは tpl-tools と同じリポジトリにあり、CLI の検査と同じ規則で TPL を書く。

## 前提条件

このスキルはホスト repo が **`docs/test-perspectives/`（TPL）を採用している場合のみ** 意味を持つ。

- ディレクトリが存在しない場合は、まず「`docs/test-perspectives/` を新設して運用を始めるか」をユーザーに確認する。始める場合は最初の 1 件をこのスキルで作成し、必要なら `docs/test-perspectives/README.md`（運用方針の入り口）と `TEMPLATE.md`（この skill ディレクトリの [`TEMPLATE.md`](TEMPLATE.md) をコピーする）も用意する。`tpl` を使うなら `tpl init` で `tpl.config.json` の雛形を作れる
- ディレクトリはあるが空 / `README.md` も `TEMPLATE.md` も無い、という状態でも動作する（既存ファイルが無ければスキャンは no-op）

## ホスト repo の設定を読む

TPL を書く前に、ホスト repo が `tpl` をどう使っているかを確かめる。**ホスト repo の CLI の版を前提にせず、ホスト repo のファイルに書かれていることから振る舞いを決める。** このスキルは tpl-tools の最新の版に合わせて書かれているが、ホスト repo の CLI はそれより古いことがある。

### `tpl` の呼び方

次の順で、最初に見つかったものを使う:

1. ホスト repo が CI やパッケージの script で `tpl` を包んでいれば、その呼び方（例: `pnpm tpl:validate`）。フラグや `--config` はホスト repo が決めているので、自分で組み立てない
2. `@kompiro/tpl-tools` が devDependency にあれば `pnpm exec tpl` / `npx tpl`
3. `PATH` 上の `tpl`（standalone バイナリ）
4. どれも無ければ CLI なしで進める。検証は手で frontmatter を確認する。関連 TPL は `docs/test-perspectives/` 配下の frontmatter（`topic` / `scope.packages` / `applicable_to` / `known_consumers`）に加えて、本文（frontmatter とフェンス内を除く）が名指すパスも grep する。CLI も本文のパスで変更ファイルから TPL を引く

### config

`tpl` は `tpl.config.json`（作業ディレクトリ）か、`--config` で渡されたファイル（例: adr-tools と共有する `adr.config.json`）を読む。ホスト repo の script が `--config` を渡していればそのファイルを読む。キーがあればその規則に従い、無ければその規則は無いものとして扱う（CLI は知らないキーを無視するので、版で入ったキーは config に書いてあっても、ホスト repo の CLI がその版より古ければ効かない。下記「古い CLI」）:

| キー | 書くときに従うこと |
| --- | --- |
| `idFormat` | id とファイル名の形式。既定は `date-sequence`（`TPL-YYYYMMDD-NN`）、もう一方は `issue-number`（`TPL-<n>`）。config が無いときも既定の `date-sequence` になる |
| `topics` | `topic` はこの語彙のどれか。無ければ free-form の小文字 kebab。ホスト repo が ADR の語彙（`adr.config.json` の `topics` 等）を持つなら TPL と共有する |
| `indexFile` / `indexCheck` | 索引が生成ファイルかどうか（下記「索引」）。`indexCheck` の既定は `true`（`indexCheck` は tpl-tools v0.0.13 以降） |
| `checklistHeading` | チェックリストの節の見出しと、項目末尾のマーカー（下記「チェックリスト」） |
| `sourcePrefixes` | 本文のコードスパンのうちソースのパスとして扱う最上位ディレクトリ。`tpl validate` が実在を検査し、`tpl related --changed-files` がこれで TPL を引く（tpl-tools v0.0.14 以降） |
| `testFileInfixes` | テストファイル名からソースを引く規則。既定は `[".test",".spec"]`（`foo.test.ts` → `foo.ts`。tpl-tools v0.0.14 以降） |

### 使うサブコマンド

- `tpl validate` — 作成・更新・deprecate の後に必ず実行する（下記「検証」）
- `tpl related <topic>` — 同じ topic の active TPL を一覧する。tpl-tools v0.0.14 以降は `tpl related --changed-files <path>...` / `--base <ref>` で、変更したファイルから TPL を引ける。この 2 つは本文のパスを読むので、config に `sourcePrefixes` が無ければ `--source-prefix` が要る（無いと終了コード `2`。渡す prefix は下記「検証」と同じ決め方で、決められなければユーザーに尋ねる）
- `tpl regenerate` — 生成索引を書く。**ホスト repo が索引を PR の外で更新する運用なら、PR では実行しない**（下記「索引」）
- `tpl checklist` — チェックリスト項目とマーカーを一覧する
- `tpl review-body` — 定期 deprecation レビューの Issue 本文を出す（下記「deprecate」）
- `tpl init` — `tpl.config.json` の雛形を作る（TPL を新設するときだけ）

### 古い CLI

このスキルは、版で入った機能に「tpl-tools vX 以降」と書いている。`tpl` に `--version` は無いので、ホスト repo の CLI がその機能を持つかは `tpl <subcommand> --help` に出てくるかで確かめる（lock file や `node_modules/@kompiro/tpl-tools/package.json` の版を見てもよい）。持たないときは次で代える:

- `tpl related --changed-files` / `--base` が無い（v0.0.13 以前）: 変更したファイルのパスで `docs/test-perspectives/` の本文を grep し、`tpl related <topic>` の結果と合わせる
- `sourcePrefixes` / `testFileInfixes` が効かない（v0.0.13 以前）: config に書き足さない。`tpl validate` に prefix が要るときは `--source-prefix` で渡す（下記「検証」）
- `scope.paths` が読まれない（v0.0.13 以前）: 書かない。検査も recall もされない glob になる
- `indexCheck` が効かない（v0.0.12 以前）: config に `indexCheck: false` があっても `tpl validate` は索引を検査するので、PR の外で更新する索引は TPL を足すたびに行の欠けで落ちる。PR に索引の差分は含めないまま、ユーザーに v0.0.13 以降への更新を提案する

### その他

- **ファイル名規約**: `idFormat` に従う。ホスト repo が config に無い独自の規約を README 等で定めていればそれに従う
- **定期 deprecation レビュー**: cadence（週次 / 月次 / 半期）と自動化（CI で review Issue を自動生成する等）はホスト repo に委ねる。このスキルは「`active` な TPL を放置しないため定期レビューを推奨」とだけ示す

## 手順

### 1. モードの判定

スキル起動時の引数・会話の文脈から、以下のどれかを判定する:

- **新規作成** — bug / test-infra Issue から、または原則（concepts / ADR）から、新しい観点を起こす
- **既存更新** — 新しい Issue が既存 TPL のパターンに該当する／チェックリスト・対処パターン・関連テストの refresh が必要
- **deprecate** — 構造変更などで、ある観点が原理的に発生しなくなった

### 2. 新規作成

#### 2-1. 起源を判定する

TPL は 2 つの起源から生まれる。frontmatter の `discovered_from` で区別できるようにする:

- **Retrospective（事後）** — `bug` または `test-infra` ラベルの Issue から、実際に起きた失敗を一般化する。`discovered_from.issue: "#N"` にその Issue を書く。`test-infra` は E2E flake / fixture / harness の問題で、典型的には testing 系トピックの観点を生む
- **Proactive（事前）** — アーキテクチャ原則 / 非目標 / north-star（`docs/concepts*` のようなファイルや ADR）から、原則が破られたときに起きるであろう失敗を予測して観点化する。`discovered_from.root_cause_file: "docs/concepts.*"` または `discovered_from.root_cause_adr: "ADR-..."` を**加えて**持つ

`discovered_from.issue` は起源の目印ではなく **TPL を起こした作業の Issue** で、起源を問わず先頭に書く。proactive でも、作業（DesignDoc・機能実装）に Issue があればそれを書く。`issue-number` 形式では番号も通常この Issue から採る（2-3）。同じ Issue から 2 本目以降の TPL で番号が PR 番号に進んだ場合も、`issue:` にはその Issue を書く。proactive かどうかは `root_cause_file` / `root_cause_adr` の有無で判定し、`issue:` が無いことでは判定しない（`issue:` を省くと、レビュアーが「起点 Issue の無い TPL」と読んで PR 番号への採番し直しを求める）。

起源が違うだけで、frontmatter スキーマ・3-Yes ルール・更新/deprecate の運用ルールはすべて同じ。

#### 2-2. 3-Yes ルールで作成可否を判断する

以下の 3 つすべてが Yes なら新規 TPL として起こす。1 つでも No なら、個別 Issue として処理して TPL は作らない:

1. 同じ root cause が **別の機能でも発生しうる** か?
2. 構造的なパターンとして **再発する可能性がある** か?
3. 既存の TPL でカバーされていない観点か?（既存 TPL のパターンに該当するなら「既存更新」へ）

3 の確認には `tpl related <topic>` を使う。変更したファイルが決まっていれば `tpl related --changed-files <path>...`（v0.0.14 以降）も使う。

#### 2-3. ファイルを作成する

- ファイル名と見出しは config の `idFormat` に従う:
  - **`date-sequence`**（既定。config が無いときもこれ）: `docs/test-perspectives/TPL-YYYYMMDD-NN-<slug>.md`、見出し `TPL-YYYYMMDD-NN`。`YYYYMMDD` は作成日、`NN` はその日の既存 TPL の最大 + 1（`01` から、ゼロ埋め 2 桁）
  - **`issue-number`**: `docs/test-perspectives/TPL-<番号>-<slug>.md`、見出し `TPL-<番号>`、ゼロ埋めなし。番号の決め方は下記

  `<slug>` は観点を端的に表す小文字 kebab。採番後はリネームしない（外部参照が番号を指すため）。

  `issue-number` の番号は GitHub の番号ベースで採る。判定基準は 1 つ: **その TPL を起こした作業に Issue があるか**。起源（retrospective / proactive）では分けない。

  1. 作業の Issue 番号: retrospective TPL は起点の `bug` / `test-infra` Issue、proactive TPL はそれを起こした DesignDoc・機能の Issue（いずれも `discovered_from.issue` に書く Issue）
  2. 作業に Issue が無い、またはその Issue 番号を別の TPL がすでに使っているときだけ PR 番号: TPL を起こした PR（proactive なら DesignDoc PR）の番号を使う（draft PR を先に開く運用と整合）
  3. どちらも無いときだけローカル採番（`docs/test-perspectives/` 内の既存最大 + 1）

  番号は 1 TPL = 1 番号で一意にする。同じ Issue / PR から複数 TPL を切る場合は、番号をその起点を最もよく表す 1 本に与え、残りは次の優先順位へ進める（Issue → PR → ローカル採番）。同じ番号を `<slug>` 違いで共有すると `duplicate-id` 検査に落ちる。`date-sequence` の `NN` もローカル採番も並行ブランチ間で衝突しうるので、採番後に `tpl validate` を実行する（重複 id は `duplicate-id` として、tpl-tools v0.0.7 以降で検出される）。
- frontmatter と本文（5 節構成）の雛形は、この skill ディレクトリの [`TEMPLATE.md`](TEMPLATE.md) を使う。`TEMPLATE.md` をコピーして冒頭の HTML コメントを削除し、frontmatter と各節を埋める。本文は 観点 / 想定される失敗モード / チェックリスト（3〜5 項目）/ 既知の対処パターン / 関連テスト の 5 節。
  - `applicable_to` — 適用される **抽象パターン**。consumer の具体名は書かない（そちらは `known_consumers`）。consumer 空間が広すぎて列挙が無意味なら `known_consumers` ごと省略してよい
  - `known_consumers` — 新たに該当 consumer が見つかったら追記する
  - `scope.paths` — 本文がどのファイルも名指さない TPL（例: すべての workflow に当てはまる規則）にだけ glob を書く。広い glob はほぼすべての `tpl related --changed-files` に出てくるので狭く保つ（tpl-tools v0.0.14 以降）
  - 本文で守っているテストやソースを名指すときは、`sourcePrefixes` の下のパスをコードスパン全体で書く。`tpl validate` が実在を検査し、`tpl related --changed-files` がそのファイルの変更でこの TPL を引く

#### 2-4. チェックリスト

config に `checklistHeading` が無ければ、雛形の「チェックリスト」節に 3〜5 項目を書く。

config に `checklistHeading` があれば、`tpl validate` はその見出しの節と 1 つ以上の項目を求め、項目末尾のマーカーの形を検査する。

- 節の見出しを `checklistHeading` の文字列にする（雛形の「チェックリスト」から置き換える）
- マーカーは、その項目を実際に守っているファイルがあるとき（`` [guard: `path`] ``。そのファイルが新しい違反でも CI を落とす）か、プログラムでは判定できない項目のとき（`[judgment]`）だけ付ける。マーカーは項目の最後に、空白 1 つで区切って置く
- どちらでもない項目にはマーカーを付けない。印のない項目は `unguarded` として有効で、守られていない項目に `[guard]` を付けるのは印が無いより悪い

#### 2-5. 索引

ホスト repo の TPL の一覧は、`tpl regenerate` が書く生成ファイルか、手で保守する表かのどちらか。config の `indexFile` で判定する（索引がまだ一度も生成されていなくても、`indexFile` があれば生成ファイルの側）:

- **生成された索引**（config に `indexFile` がある。生成済みならそのファイルのヘッダに「`tpl regenerate` で生成。手で編集しない」旨がある）:
  - config の `indexCheck` が `false` なら、ホスト repo は索引を PR の外（定期の再生成 PR 等）で更新している。**PR では索引を編集も再生成もせず、TPL のファイルだけを変える。** 手元で `tpl regenerate` を実行して索引に差分が出たら、その差分は PR に含めない
  - `indexCheck` が無いか `true` なら、TPL と一緒に `tpl regenerate` で索引を書き直し（まだ無ければ作られる）、同じ PR に含める（`tpl validate` が索引の行の欠けを検査する）。手で編集はしない
  - どちらの場合も、索引がいつ・どう更新されるかはホスト repo の `docs/test-perspectives/README.md` の記述を優先する
- **手で保守する一覧表**（`indexFile` が無く、`docs/test-perspectives/README.md` 等に表がある）: そこに行を追加する。`indexCheck` が `false` でなければ `tpl validate` が表との整合を検査する

#### 2-6. 検証

作成後に `tpl validate` を実行し、finding が無くなるまで直す（終了コード `0` = clean、`1` = finding、`2` = 使い方の誤りか I/O エラー）。

- ホスト repo の script（例: `pnpm tpl:validate`）があればそれを使う。ホスト repo が渡しているフラグ（`--config` / `--packages-root` / `--source-prefix` 等）がそのまま効く
- 自分で `tpl validate` を呼ぶときは、ホスト repo の CI の呼び方に揃える。config に `checklistHeading` があって `sourcePrefixes` が無いと（CLI が v0.0.13 以前なら `sourcePrefixes` があっても）、`--source-prefix` が必須になる（無いと終了コード `2`）。渡す prefix は、ホスト repo がソースを置いている最上位ディレクトリ（`src` / `packages` / `scripts` など、guard が名指しうるもの）で、guard の path はそのいずれかの下に解決できなければならない。決められなければユーザーに尋ねる
- CLI が無いホスト repo では、雛形冒頭の規約メモに沿って frontmatter を手で確認する

> proactive を引用した DesignDoc は、その実装 PR で該当チェックリスト項目の contract test と AT AC を着地させる（"forward 運用"）。`acceptance-test` スキルがこの転記を行う。

### 3. 既存更新

新しい Issue が既存 TPL のパターンに該当する場合（3-Yes の 3 番目が No）、その TPL を更新する:

- `discovered_from` セクションに Issue を追記する
- チェックリスト・「既知の対処パターン」・「関連テスト」の更新が必要ならそれも行う（`checklistHeading` がある host ではマーカーの付け方も 2-4 に従う）
- 起源は変えない（retrospective の TPL に proactive の根拠が後付けされることはあるが、`discovered_from` に両方並べればよい）
- 更新後に `tpl validate` を実行する（2-6）

### 4. deprecate

実装の構造変更などで、ある観点が **原理的に発生しなくなった** 場合:

- `status` を `deprecated` に変更する
- エントリ自体は **削除しない**。本文の末尾に「なぜ deprecated にしたか」の rationale を追記する（後から「この観点はなぜ消えたのか」を辿れるようにするため）。rationale には `deprecated` の語を含める（`tpl validate` がこれを要求する）
- より新しい TPL がこの観点を包含する場合は、その TPL を `superseded by TPL-<番号>` として rationale に明記する（ADR の `superseded_by` 運用と同じ）
- deprecate の **トリガー** は定期 deprecation レビュー（前述、cadence はホスト repo 次第）で起こすのが基本。`tpl review-body` がレビュー Issue の本文を出す。レビューでは各 `active` TPL について「引用された `root_cause_file` / `root_cause_adr` は今も存在するか」「アーキテクチャの前提が変わっていないか」「これを包含するより新しい TPL があるか」を確認し、`keep` / `update` / `deprecate` を判断する
- 変更後に `tpl validate` を実行する（2-6）

### 5. レビュー依頼

作成・更新・deprecate した TPL ファイル（手で保守する一覧表を持つホスト repo では表の差分も、索引を PR ごとに再生成するホスト repo では索引の差分も）をユーザーに提示し、レビューを依頼する。

## TPL のライフサイクル

```
concept（docs/concepts.* / ADR）
   │   原則を実装に落とすときに違反しうる観点を抽出
   ▼
proactive TPL   ← 開発前に書く（予防可能な学習）
   │
   ▼
development（DesignDoc + 実装）
   │
   ▼
bug（proactive TPL でカバーできなかった失敗）
   │   実際に起きた失敗を一般化
   ▼
retrospective TPL   ← bug 修正と同じ PR で書く（不可避な学習）
```

- **proactive TPL** は **予防可能** な学習 — 書ければ bug を未然に防げる。書ければ書けるほど retrospective に学ぶしかない bug が減る
- **retrospective TPL** は **不可避** な学習 — 起きてからしか書けないが、起きたら必ず書く（同じ bug を 2 回起こさない）
- retrospective TPL を書くたびに「この観点を proactive TPL として書いておけたか?」を自問する。書けたはずなら、それは「proactive スキャンの漏れ」自体が次回のレトロスペクティブの素材になる（TPL としては記録しない）

## ADR との違い

- **ADR**: 過去の判断の記録（「我々はこう決めた」）
- **TPL**: 未来の検証の集約（「これを検証すべき」）

両者は frontmatter の `topic` / `scope.packages` を共有しているので、同じトピックで横串検索すれば「過去の判断」と「検証すべき観点」を同時に発見できる。

## 参照タイミング（他スキルとの連携）

- **DesignDoc 作成時**（`design-doc` スキル）: 該当 `topic` / `scope.packages` の既存 TPL を一覧し（`tpl related <topic>`）、さらに同じ topic の `concepts*` / 関連 ADR を読んで、まだ TPL になっていない原則で今回の設計が違反しうるものがないか確認する。あれば 3-Yes ルールに照らして proactive TPL を **同じ PR で** 起こす（このスキルを呼ぶ）
- **新機能の実装時 / 受け入れテスト作成時**（`acceptance-test` スキル）: AC を書く前に該当 TPL のチェックリストを確認し、引用した proactive TPL のチェックリスト項目を AC に転記する
- **PR を開く前**: 変更したファイルから関連 TPL を引き（`tpl related --base <ref>`、v0.0.14 以降）、チェックリストを確認する。`--base` は `<ref>` と `HEAD` を比べるので、コミットしていない変更は入らない。先にコミットするか、そのパスを `--changed-files` で渡す
- **bug 修正時**: 同じパターンの TPL がすでに存在しないか確認し、あれば `discovered_from` に追記する。なければ 3-Yes ルールで retrospective TPL の新規作成を検討する。併せて「この bug は proactive TPL を書いていれば防げたか?」も自問する

`design-doc` / `acceptance-test` は [kompiro/hane](https://github.com/kompiro/hane) のスキル。

## スコープ外

`topic` / `package` に紐付かない **メタ観点**（全機能 PR に共通して適用する横断フィルタなど）は TPL スキーマに載せない。横串検索の単位（`topic` / `scope.packages`）を持たないものは TPL として管理する利点が薄いため。そういう観点はホスト repo の Issue / PR テンプレートのチェックリスト等で surface する。
