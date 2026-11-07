---
id: ADR-39
title: Ship the test-perspective skill from this repo as a Claude Code plugin
status: accepted
date: 2026-11-07
topic: architecture
related_to: [ADR-6, ADR-27, ADR-31, ADR-35, ADR-41]
---

# ADR-39: Ship the test-perspective skill from this repo as a Claude Code plugin

- **Date**: 2026-11-07
- **Status**: Accepted
- **Related**:
  - Issue #39, PR #40 (design), PR #45 (implementation)
  - `.claude-plugin/plugin.json`, `skills/test-perspective/`,
    `test/skill-drift.test.ts`, `CONTRIBUTING.md`
  - ADR-27 (generated index), ADR-31 (checklist markers), ADR-35 (`indexCheck`) and
    ADR-41 (`sourcePrefixes`, `scope.paths`, changed-file recall) define rules the
    skill now states; ADR-6 (the distribution this adds to)
  - Host side: kompiro/hane#99 (the bug that exposed the drift), kompiro/hane#101
    (marketplace entry, deprecating hane's copy, and the ADR that partly supersedes
    hane ADR-10)

## Background

The skill that writes TPL records, `test-perspective`, lived in kompiro/hane. hane
ADR-10 put it there to keep tooling out of hane, when the tooling was kompiro/karasu's
`tpl:*` scripts and the skill decided how a TPL is written.

The tooling then moved here, and most of those rules moved with it. The skill followed
behind them and drifted:

- **Index.** ADR-27 made the index a generated file and ADR-35 let a host keep it out of
  PRs. The skill still said to add a row to a table, which kompiro/hane#99 caught.
- **Checklist markers.** With ADR-31's `checklistHeading` set, `tpl validate` requires
  that heading and checks the marker shape. The skill knew neither, nor the
  `--source-prefix` that a direct `tpl validate` call then needs.
- **Id format.** The CLI defaults to `date-sequence`. The skill wrote `TPL-<n>` without
  reading the config.
- **Templates.** This repo's and hane's `TEMPLATE.md` had already diverged.

Each rule change here needed a second PR in hane. A missed one surfaced only when a host
wrote a TPL and it failed.

## Decision

Make this repo a Claude Code plugin named `tpl-tools`, and move the skill into it as
`skills/test-perspective/`, invoked as `/tpl-tools:test-perspective`. A PR that changes
how a TPL must be written updates the skill in the same PR. The skill's `TEMPLATE.md` is
the only template. hane's marketplace distributes the plugin, and this repo has no
marketplace of its own.

## Rationale

- **The rule and its description change together.** Only this option lets one PR change
  both, and lets a test in this repo catch a skill that fell behind.
- **The npm package does not change.** The `files` list in `package.json` excludes
  `skills/` and `.claude-plugin/`, so CLI users receive nothing new.
- **The skill does not assume a CLI version.** The plugin updates from the marketplace
  while a host pins its CLI, so the two can differ. The skill reads the host's config and
  index, prefers the host's own `tpl` script, and gives a fallback for each feature an
  older CLI lacks.
- **The drift test checks names and defaults only.** `test/skill-drift.test.ts` fails
  when the skill omits a config key from `src/config.schema.json`, omits a subcommand from
  the CLI dispatcher, leaves out a schema default, or names a `--flag` the CLI does not
  define. It also holds `.claude-plugin/plugin.json`'s version equal to `package.json`'s.
  A change in what a rule means passes the test, so `CONTRIBUTING.md` requires the skill
  update and review catches the rest.
- **One template, at the skill.** `docs/test-perspectives/TEMPLATE.md` is gone. The
  reference README uses absolute links to the skill's template, because hosts copy that
  README and relative links would break there.

## Rejected alternatives

- **Keep the skill in hane and detect drift with a check.** Users need no migration, but
  the fix still takes a PR in another repo, and the check would have to check out one
  repo from the other's CI.
- **Bundle the skill in the npm package and copy it into hosts with `tpl init`.** The
  skill would match the host's CLI at copy time, then stay old until someone copied it
  again. That moves the drift from hane into every host, and sends a file to users who do
  not use Claude Code.
- **A separate repo for the skill.** The rules and their description stay in different
  repos, which is the problem being solved.
- **Generate the skill's rule sections from a machine-readable contract.** This would
  catch drift in meaning too, but needs a generator and a contract format. Worth
  revisiting if the drift test proves too weak.

## Consequences

- Hosts install one more plugin. The README's install commands work only after
  kompiro/hane#101 adds the marketplace entry. Until then hane's copy keeps working, and
  it should not be deprecated before that entry exists.
- A release also bumps `.claude-plugin/plugin.json`. The test fails if it is forgotten.
- The skill now records which tpl-tools version each feature needs. These notes grow with
  each feature, and can be dropped once no supported host is on an older CLI.
- Still open:
  - Whether a marketplace entry can pin the plugin to a release tag. If it cannot, the
    plugin follows the default branch, and the version-independent skill absorbs the gap.
  - Whether the CLI needs `tpl --version`. The skill does not need it today.
