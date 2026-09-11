# TPL 本文が名指すソースパスの検証

- **日付**: 2026-09-07
- **Issue**: [#17](https://github.com/kompiro/tpl-tools/issues/17)
- **PR**: （このドキュメントの PR）
- **ステータス**: 検討中
- **関連**: [ADR-6](../adr/6-standalone-binary-distribution.md)（依存の制約）、[ADR-8](../adr/8-standalone-config.md)（opt-in と fallback の型）、downstream の実装 [karasu#2648](https://github.com/kompiro/karasu/issues/2648) / [karasu#2652](https://github.com/kompiro/karasu/pull/2652)

## 背景・課題

`tpl validate` は frontmatter しか読まない。`--packages-root` が見るのも `scope.packages` だけで、**本文は一度も読まれない**。そのため TPL の `## 関連テスト` 節が削除済みの spec を指していても、検証は通り続ける。

karasu ではこれは仮定の話ではなかった。129 件の TPL のうち **7 件が存在しないパスを名指し**ており、うち 2 件（`packages/core/src/style/property-schema.test.ts`、`packages/app/src/App.test.tsx`）は**一度も存在したことがなかった**。さらに karasu の `.coderabbit.yaml` には「存在しないテストパスを名指す TPL を報告せよ」と書かれていた。規則が要ることは認めながら、機械的に強制するものが無かったということである。

観点として言えば、これは「再読される記録は、記録より長生きするアドレスを指す」の**ソースパス層**にあたる。URL 層は既存の運用が拾っているが、その 1 つ下が空いていた。

## 制約・前提

- **依存を増やせない**（[ADR-6](../adr/6-standalone-binary-distribution.md)）。この CLI は `node:fs` / `node:path` + `js-yaml` だけで動き、`bun build --compile` で 5 ターゲットの単一バイナリになる。新しい依存はその前提を壊す。本件は `existsSync` と正規表現だけで書けるので、この制約は満たせる。
- **全 consumer が monorepo とは限らない。** `--packages-root` が既に optional なのはそのためで、同じ理由が本件にも当てはまる。既定で有効にはできない。
- **karasu は自前のコピーを残す。** karasu 側のガードは `docs/acceptance/` と `docs/design/` も見るが、これは tpl-tools の守備範囲外である。したがって本機能の受益者は「これから tpl-tools を採用する repo」と「TPL ディレクトリという tpl-tools 本来の守備範囲」であって、karasu の重複が消えるわけではない。**この点は本検討で最も弱い部分**なので、方針の節で正面から扱う。
- **記録が意図的に不在パスを名指すことがある。** 廃止されたテストを歴史として書く、まだ作っていないファイルを設計として書く、といった正当な用法がある。単純な存在チェックだけでは 1 週間で無効化される。

## 検討した選択肢

### 案1: downstream のまま（tpl-tools には入れない）

Issue が明示的に挙げている選択肢。tpl-tools の表面積は増えず、`--packages-root` 以上の設定概念も要らない。

一方で、TPL を採用する repo はそれぞれ 300 行規模のガードを書き直すことになる。karasu の実装は fence の入れ子、マーカーの寿命、生成物の除外といった非自明な判断の塊で、素朴に書き直すと誤検知で数日以内に切られる。**「TPL の本文が指すものが生きているか」は TPL の道具が持つべき関心**であって、consumer 側の雑務ではない。

### 案2: `tpl validate` にフラグで載せる（`--source-prefix <dir>` を反復指定）

`--source-prefix packages --source-prefix scripts` のように、ソースを含むディレクトリを列挙する。1 つも渡さなければ検査しない。`--packages-root` と同じ opt-in の形で、非 monorepo の consumer は何も変わらない。

prefix の allowlist が、deny-list なしで誤検知を防ぐ鍵になっている（次節）。

### 案3: `tpl.config.json` に `sourcePathPrefixes` を持たせる

repo 固有の語彙という意味では `topics` と同類で、[ADR-8](../adr/8-standalone-config.md) が config を reference data の置き場と定めた線に沿う。CI のコマンドラインは短くなる。

ただし schema（`src/config.schema.json`）と `tpl init` のテンプレート（`src/init.template.ts`）の両方を変えることになり、リリース資産としての schema も更新が要る。**まだ 1 件も consumer がいない設定を先に schema へ焼き付ける**のは順序が逆である。

### 案4: prefix を指定させず、パスらしい code span を全部見る

設定が要らないので一見きれいだが、`packages/foo`（`applicable_to` の例示）、`<spec path>`（プレースホルダ）、`cp a b`（シェル行）を除くために**例示名の deny-list** が必要になる。これは karasu が別件（ADR-2125）で明確に retire した保守の形で、破綻の仕方が分かっている。

## 比較

| | 案1 downstream | 案2 フラグ | 案3 config | 案4 自動判別 |
|---|---|---|---|---|
| consumer の実装負担 | 各自 300 行 | なし | なし | なし |
| 非 monorepo への影響 | なし | なし（未指定なら無効） | なし | **誤検知** |
| 新しい設定面 | なし | フラグ 1 つ | schema + init template | なし |
| 誤検知の抑え方 | 該当なし | prefix allowlist | prefix allowlist | deny-list（破綻既知） |
| ADR-6 の依存制約 | 該当なし | 満たす | 満たす | 満たす |

## 現時点の方針

**案2 を採る。** `--packages-root` と同じ opt-in のフラグ 1 つで、schema を触らず、非 monorepo の consumer に何の影響も与えない。案3 は consumer が複数現れて「毎回同じ prefix を CI に書いている」と分かってからでよい。そのとき案2 のフラグは残せるので、後戻りにはならない。

karasu で実証済みの規則をそのまま移植する。どれも誤検知を出さないために要る。

1. **code span 全体がパスに一致するものだけを候補にする。** この 1 つの規則で、glob（`at-*.spec.ts`）・プレースホルダ（`<spec path>`）・シェル行が例示名の deny-list なしに落ちる。
2. **YAML frontmatter と fence の中は読まない。** frontmatter は既存の検証が見ており、`applicable_to` の散文には `packages/foo` のような仮の名前が入る。fence にはコマンドや実行例が入る。
3. **生成物のセグメントを除外する。** `node_modules` / `dist` / `out` / `coverage` / `build` はクリーンチェックアウトに無いのが正常状態で、不在は腐りではない。
4. **不在を意図する行は、その 1 行上で理由込みに宣言する。**

   ```markdown
   <!-- absent-path-next-line: 廃止した spec、歴史として名指す (#1585) -->
   ```

   宣言はスイッチではなく主張なので、**両方向から縛る**。理由が空なら失敗し、かつ何も抑止しない。逆に、その行のパスが全部解決するなら「使われていない宣言」として失敗する。こうしないと宣言だけが主張より長生きする。

マーカー名は karasu と**同一の `absent-path-next-line` にする**。同じ記録が repo 間を移動しても意味が保たれるためで、ここで名前を変える利得は無い。

## レビューで確定した仕様

[PR #23](https://github.com/kompiro/tpl-tools/pull/23) のレビュー指摘 4 件に対する結論。いずれも実装とテストに反映済み。

- **パスは「ファイルであること」を要求しない。** ディレクトリでも解決とみなす。`statSync().isFile()` を要求する案が出たが、karasu の記録には**正当なディレクトリ参照が 95 件**あり（`packages/core/src/renderer/` のように節の所在を示す用法）、要求すると全部が誤検知になる。末尾スラッシュは受理して落とす。
- **`--source-prefix` は反復指定を保つ。** 既存の `parseFlags` は値フラグを `Map<string, string>` に入れるので、2 回目が 1 回目を上書きしていた。`optionsAll: Map<string, string[]>` を足して全出現を保持する。`options` の意味は変えないので、単一値のフラグは影響を受けない。
- **本文は全体を走査する。** 背景で `## 関連テスト` を例に挙げたが、対象はそこに限らない。観点の散文でもチェックリストでもパスは名指されるので、frontmatter と fence を除く**本文全体**を読む。
- **prefix の一致はセグメント単位で行う。** 文字列前方一致にすると `packages-old/foo` が prefix `packages` に一致してしまう。span をセグメントに分割し、先頭セグメントとの完全一致で判定する。`.` と `..` を含む span、および `\` を含む span は候補にしない。解決は working directory 起点。

## 実装レビューで確定した仕様

[PR #24](https://github.com/kompiro/tpl-tools/pull/24) のレビュー指摘 4 件に対する結論。いずれも実装とテストに反映済み。

- **code span は backtick run の長さで閉じる。** 単一の backtick だけを見ていると、`` `` … `` `` の形で書かれた span はパディングの空白ごと候補になって落ち（見逃し）、逆に内側の backtick を区切りと取って、行が名指していないパスを拾う（誤検知）。CommonMark どおり「n 本の run は次の n 本で閉じる」で読み、両端に空白があれば 1 つずつ外す。backslash escape は解釈しないが、`\` を含む span は候補にならないので見逃し側にしか転ばない。
- **block quote の中の fence も fence として扱う。** `> ` で始まる fence は検出に掛からず、引用した実行例の中まで読んでいた。`>` を落としてから fence を判定する。閉じ fence が引用内に無いときは引用の終わりで閉じる（CommonMark と同じ）ので、閉じ忘れが以降の文書全体を黙らせることはない。
- **fence に見えて fence でない行も、普通の Markdown として読み切る。** info string に backtick を含む行は fence を開かないが、そこで早期 return していたため、直前の宣言が次の行ではなくさらに下の行に掛かっていた。宣言の寿命は「次の 1 行」なので、この行で使い切る。
- **空の `--source-prefix` は usage error。** `--source-prefix=` は空文字を渡す。どの先頭セグメントとも一致しないので、要求された検査が黙って無効になる。パスを渡した場合と同じく 2 で落とす。

## 未解決の問い

- **生成物セグメントの一覧を固定にするか、設定可能にするか。**（実装では固定を採った） karasu の一覧には `.astro` / `.vscode-test` / `preview-dist` など repo 固有のものが混ざる。まずは普遍的な 5 つ（`node_modules` / `dist` / `out` / `coverage` / `build`）を固定で持ち、足りない例が出てから考える方に倒したい。prefix と違い、ここは誤検知ではなく**見逃し**の側に転ぶので、固定でも安全側である。
- **findings の重大度をどう扱うか。** 既存の `Finding` は全て失敗扱いだが、本件の 3 種（不在パス / 使われていない宣言 / 理由なし宣言）も同じでよいか。karasu では全て失敗で運用できている。
