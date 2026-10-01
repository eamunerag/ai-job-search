# buscadorempleo-cli

CLI for searching vacancies on Colombia's [Buscador de Empleo](https://buscadordeempleo.gov.co)
(Servicio Público de Empleo). No authentication, no API key, zero runtime dependencies
(plain `bun` + `fetch`; the portal's API returns JSON).

Personal use only: keep volume low.

## Install

```bash
cd .agents/skills/buscadorempleo-search/cli && bun install
```

`bun install` only pulls dev types for `bun run typecheck`; the CLI itself runs without it.

## Usage

```bash
bun run src/cli.ts search -q "sostenibilidad" -l "Bogotá" --format table
bun run src/cli.ts search -q "economia circular" --jobage 14
bun run src/cli.ts detail 1081300 --format plain
```

| Flag | Meaning |
|------|---------|
| `--query`, `-q` | Keyword(s), without accents. Required. |
| `--location`, `-l` | Municipality or department. Resolved to the API's exact name with one extra request. |
| `--jobage <days>` | Posted within N days, filtered client-side on the fetched page. |
| `--page <n>` | 1-indexed page, 50 results each, newest first. |
| `--limit`, `-n` | Cap results emitted. |
| `--format` | `json` (default), `table`, `plain`. |

Errors go to stderr as `{ "error", "code" }` with exit code 1.

## Development

```bash
bun run typecheck
bun run test      # includes one live smoke test against the portal
```

Endpoints, field mappings and the TLS certificate quirk are documented in `../url-reference.md`.
