# anthesis-cli

CLI for searching the open roles on [Anthesis Group's careers site](https://anthesisgroup.pinpointhq.com/es)
(hosted on Pinpoint). No authentication, no API key, zero runtime dependencies (plain `bun`
+ `fetch`; the site publishes a JSON feed).

Personal use only: keep volume low. Each call downloads the full postings feed.

## Install

```bash
cd .agents/skills/anthesis-search/cli && bun install
```

`bun install` only pulls dev types for `bun run typecheck`; the CLI itself runs without it.

## Usage

```bash
bun run src/cli.ts search -l "Colombia" --format table
bun run src/cli.ts search -q "packaging" --format table
bun run src/cli.ts detail 554981 --format plain
```

| Flag | Meaning |
|------|---------|
| `--query`, `-q` | Words that must all appear in the posting. Optional: omit to list every role. |
| `--location`, `-l` | Country or city, filtered client-side. |
| `--jobage <days>` | Accepted but unsupported: the feed has no posting date. |
| `--page <n>` | 1-indexed page, 20 results each, paged client-side. |
| `--limit`, `-n` | Cap results emitted. |
| `--format` | `json` (default), `table`, `plain`. |

Errors go to stderr as `{ "error", "code" }` with exit code 1.

## Development

```bash
bun run typecheck
bun run test      # includes one live smoke test against the site
```

The feed and its field mappings are documented in `../url-reference.md`.
