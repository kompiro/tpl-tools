// Source of truth for the `tpl init` starter config. Kept as an inline string
// (rather than a companion JSON file read at runtime) so the bundled output —
// including the Bun-compiled standalone binary — is self-contained and needs no
// file on disk next to the executable.
export const INIT_TEMPLATE = `{
  "$schema": "./node_modules/@kompiro/tpl-tools/dist/config.schema.json",
  "idFormat": "date-sequence",
  "topics": ["architecture", "infrastructure", "process"]
}
`;
