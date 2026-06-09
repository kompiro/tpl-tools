# ADR Index

> `@kompiro/tpl-tools`' own ADR index. Records here are validated with the
> standalone `adr` binary from [adr-tools](https://github.com/kompiro/adr-tools)
> (pulled into the devcontainer), not an npm dependency — see
> [Validation](#validation). The template and index format originate from
> adr-tools.

Architecture Decision Records (ADRs) capture the context and reasoning
behind a project's significant design decisions. Each ADR lives in its own
Markdown file under `docs/adr/`; this README is a topic- and status-keyed
index over them.

New ADR → add a row under the matching topic in this README, in chronological
order. The validator (`adr validate`) keeps frontmatter, ID format, status
consistency, and inter-ADR references mechanically checked.

Write format: see [`TEMPLATE.md`](./TEMPLATE.md).

---

## Numbering and filename convention

The convention is driven by `idFormat` in `adr.config.json`:

| `idFormat` | Filename | Frontmatter `id` | Notes |
|---|---|---|---|
| `date-sequence` (default) | `YYYYMMDD-NN-<slug>.md` | `ADR-YYYYMMDD-NN` | Zero-padded `NN` resets to `01` each day |
| `issue-number` | `<n>-<slug>.md` | `ADR-<n>` | No zero padding. Prefer **Issue number → PR number → local sequence (existing max + 1)** when assigning `<n>` |

Pick one format per project; mixing is not supported. Body H1 must match
`<id>: <title>` from the frontmatter.

## Topics

Each ADR has a `topic` frontmatter field drawn from a project-specific
controlled vocabulary defined in `adr.config.json` (`topics`). The
section headings below correspond 1:1 to those values: when you add a new
topic to the config, also add a section here so readers have a place to
file the ADR. Topics keep `docs/adr/` browsable as it grows past a few
dozen ADRs.

Suggested starter topics — replace with what fits your project:

### architecture

Cross-cutting structural decisions: module boundaries, layering, dependency
direction.

- [ADR-8](./8-standalone-config.md) — Give tpl its own tpl.config.json with a fallback to an explicit --config (accepted)

### infrastructure

Hosting, deployment surface, runtime, datastore choices.

- [ADR-6](./6-standalone-binary-distribution.md) — Distribute the tpl CLI as a Node-free standalone binary (accepted)

### process

Workflow conventions: review policy, release cadence, branching, CI gates.

- _(no entries yet)_

---

## Status views

`status` frontmatter is the source of truth. Curate views here for ADRs
that benefit from being indexed twice (e.g. **not adopted** decisions
worth surfacing so future readers don't re-litigate the discussion).
`superseded` relationships are best read via `npx adr regenerate`'s
generated graph rather than maintained by hand here.

### Not adopted

Decisions consciously rejected. Keep them so the rationale survives.

- _(no entries yet)_

---

## Operating rules

### When to write an ADR

- **Write one**: there were architectural alternatives, and someone may
  later ask "why did we go this way?" — including decisions consciously
  **not adopted**.
- **Skip**: trivial implementation choices, routine bug fixes, doc typos.

When in doubt, draft the decision in a lightweight design doc first and
promote it to an ADR once consensus is reached.

### Status transitions

- `proposed` → `accepted`: when the implementing PR merges.
- `accepted` → `deprecated`: implementation went away or premise broke,
  but no successor ADR exists yet.
- `accepted` → `superseded`: a successor ADR exists. Fill `superseded_by`
  on the old ADR and `supersedes` on the new one; the validator enforces
  bidirectional consistency.
- `not_adopted`: written specifically to record a rejected option.

### Validation

These ADRs are validated with the **standalone `adr` binary** from
[adr-tools](https://github.com/kompiro/adr-tools), not an npm dependency. The
devcontainer pulls it in (see [`.devcontainer/`](../../.devcontainer/)); to set
it up elsewhere, authenticate with `gh auth login` and run the installer:

```sh
curl -fsSL https://raw.githubusercontent.com/kompiro/adr-tools/main/install.sh | sh
adr validate            # schema + cross-reference checks (reads adr.config.json)
```

`pnpm run validate:adr` wraps `adr validate`. Run it before pushing so
frontmatter, ID format, status consistency, and inter-ADR references stay
mechanically checked.
