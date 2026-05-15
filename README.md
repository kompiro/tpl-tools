# @kompiro/tpl-tools

Frontmatter-driven **Test Perspective Library (TPL)** validator and query tool.
Extracted from [kompiro/karasu](https://github.com/kompiro/karasu).

A TPL is a markdown file with YAML frontmatter recording a recurring
test-perspective (typically distilled from a past bug) so the same class of
defect is caught earlier next time. This package validates a directory of such
files, lets you query them by topic/package, and renders the body for a periodic
deprecation-review issue.

## Install

Published to GitHub Packages under the `@kompiro` scope:

```
# .npmrc
@kompiro:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```
pnpm add -D @kompiro/tpl-tools
```

## CLI

```
tpl <subcommand> [options]

  validate       validate TPL frontmatter, filenames, cross-refs, README index
  related        list active TPLs matching a topic (markdown for Design Docs)
  review-body    print the body for a periodic TPL deprecation-review issue
```

### `tpl validate`

```
tpl validate [--tpl-dir <path>] [--config <path>] [--packages-root <path>]
```

- `--tpl-dir` — directory of TPL files (default `docs/test-perspectives`)
- `--config` — JSON file holding `topics` (controlled vocabulary, optional)
  and `idFormat` (optional, see below). **Omit to skip topic validation and
  use the default id format.** There is no default filename: point this at
  whatever file owns that vocabulary in your repo (in karasu that is
  `adr.config.json`).
- `--packages-root` — directory whose immediate subdirectories are the allowed
  values for `scope.packages`. Omit to skip that check (non-monorepo repos).

Exit code `0` = clean, `1` = findings, `2` = usage / I/O error.

#### `idFormat`

The config JSON may include an `idFormat` field that selects the TPL id and
filename convention:

| Value | Filename | Frontmatter `id` |
|---|---|---|
| `date-sequence` (default) | `TPL-YYYYMMDD-NN-<slug>.md` | `TPL-YYYYMMDD-NN` |
| `issue-number` | `TPL-<n>-<slug>.md` (no zero padding) | `TPL-<n>` |

Under `issue-number`, `<n>` is typically the originating GitHub Issue or PR
number; common numbering policy is **Issue number → PR number → local
sequence (existing max + 1)**. Pick one format per project; mixing in one
corpus is not supported.

```json
{
  "idFormat": "issue-number",
  "topics": ["frontend", "api", "data"]
}
```

### `tpl related`

```
tpl related <topic> [--package <pkg>] [--tpl-dir <path>] [--config <path>] [--path-prefix <p>]
```

Prints a markdown bullet list of active TPLs matching `<topic>`, ready to paste
into a Design Doc's "Related TPLs" section.

### `tpl review-body`

```
tpl review-body [--tpl-dir <path>] [--repo <owner/repo>] [--tpl-dir-relative <p>]
```

Prints the markdown body for a periodic TPL deprecation-review issue to stdout
(`--repo` defaults to `$GITHUB_REPOSITORY`). Typically piped into
`gh issue create --body-file -`.

## Reference templates

This repo ships starter templates you can copy into your project:

- [`docs/test-perspectives/TEMPLATE.md`](./docs/test-perspectives/TEMPLATE.md) —
  frontmatter + body skeleton for a new TPL
- [`docs/test-perspectives/README.md`](./docs/test-perspectives/README.md) —
  index, ADR との違い、proactive / retrospective、3-Yes ルール、ライフサイクル、運用ノート

For a fully populated example corpus, see
[karasu's `docs/test-perspectives/`](https://github.com/kompiro/karasu/tree/main/docs/test-perspectives).

## Library

```ts
import {
  validateAll,
  loadReferenceData,
  findRelated,
  formatRelatedAsMarkdown,
  renderReviewBody,
} from "@kompiro/tpl-tools";
```

## License

MIT
