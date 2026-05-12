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
- `--config` — JSON file holding a `topics` array (the controlled vocabulary
  for the `topic` field). **Omit to skip topic validation.** There is no
  default filename: point this at whatever file owns that vocabulary in your
  repo (in karasu that is `adr.config.json`).
- `--packages-root` — directory whose immediate subdirectories are the allowed
  values for `scope.packages`. Omit to skip that check (non-monorepo repos).

Exit code `0` = clean, `1` = findings, `2` = usage / I/O error.

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
