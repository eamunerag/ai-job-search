# michaelpage-cli

CLI for searching jobs on [Michael Page Colombia](https://www.michaelpage.com.co). No
authentication, no API key, zero runtime dependencies (plain `bun` + `fetch` + regex).

Personal use only: keep volume low.

## Install

```bash
cd .agents/skills/michaelpage-search/cli && bun install
```

`bun install` only pulls dev types for `bun run typecheck`; the CLI itself runs without it.

## Usage

```bash
bun run src/cli.ts search -q "sostenibilidad" --format table
bun run src/cli.ts search -q "ingeniero" -l "Bogotá" --format table
bun run src/cli.ts detail JN-092026-7098494 --format plain
```

| Flag | Meaning |
|------|---------|
| `--query`, `-q` | Keyword(s). Required. |
| `--location`, `-l` | City or department. Resolved to the site's own path with one extra request. |
| `--jobage <days>` | Cannot filter (no dates in the list); sorts newest first instead. |
| `--page <n>` | 1-indexed page, 30 results each. |
| `--limit`, `-n` | Cap results emitted. |
| `--format` | `json` (default), `table`, `plain`. |

Errors go to stderr as `{ "error", "code" }` with exit code 1.

## Development

```bash
bun run typecheck
bun run test      # includes one live smoke test against the site
```

Endpoints, parsing anchors and the robots.txt boundaries are documented in `../url-reference.md`.
