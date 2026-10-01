---
name: anthesis-search
version: 1.0.0
description: >
  Use this skill to list or search the open roles at Anthesis Group, the global
  sustainability consultancy, on its careers site (anthesisgroup.pinpointhq.com), or to
  read a specific Anthesis posting. Covers every Anthesis office worldwide, including
  Bogotá, Colombia; postings are in Spanish, English or the local language. Trigger
  phrases: Anthesis jobs, Anthesis careers, Anthesis Group openings, sustainability
  consultancy jobs, Anthesis Colombia, vacantes en Anthesis, empleo en Anthesis, ofertas
  de empleo Anthesis, trabajar en Anthesis, "hay vacantes en Anthesis", ver esta oferta de
  Anthesis.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/anthesis-search/cli/src/cli.ts *)
---

# Anthesis Group Careers Search Skill

List and search the open roles on Anthesis Group's careers site, which runs on Pinpoint.
No authentication, no API key, and **zero runtime dependencies**: it runs with just `bun`.

## ⚠️ Personal use only

This reads the careers site's public postings feed. Its `robots.txt` permits the feed and
the posting pages (checked 2026-10-01); the site's terms of use were not reviewed for
automated access. **Keep volume low and don't use it commercially or for bulk data
collection.** Every call downloads the whole feed (about 400 KB), so prefer one listing
over many narrow searches. Use is your own responsibility.

## When to use this skill

- See which Anthesis roles are open in Colombia (or any country or city)
- Search Anthesis roles by keyword across titles and full posting text
- Read a posting's full description, requirements and benefits

## Commands

### Search or list roles

```bash
bun run .agents/skills/anthesis-search/cli/src/cli.ts search [--query "<text>"] [flags]
```

Key flags:
- `--query <text>` / `-q <text>`: words that must **all** appear in the title, department, location or posting text. Accents and case are ignored. **Optional:** omit it to list every open role.
- `--location <text>` / `-l <text>`: country or city, e.g. `"Colombia"`, `"Bogotá"`, `"Spain"`. Matched client-side.
- `--jobage <days>`: accepted but **unsupported**: the site publishes no posting date (see Notes).
- `--page <n>`: page number (1-indexed, 20 results per page, paged client-side).
- `--limit <n>` / `-n <n>`: cap total results emitted (client-side).
- `--format json|table|plain`: default `json`.

### Fetch a full posting

```bash
bun run .agents/skills/anthesis-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric posting id from `search` results, e.g. `554981`. A posting URL on
`anthesisgroup.pinpointhq.com` also works, in any language prefix (`/es/`, `/en/`).

## Usage examples

```bash
# Every open role in Colombia
bun run .agents/skills/anthesis-search/cli/src/cli.ts search -l "Colombia" --format table

# Packaging roles anywhere
bun run .agents/skills/anthesis-search/cli/src/cli.ts search -q "packaging" --format table

# Roles mentioning circular economy, in Bogotá
bun run .agents/skills/anthesis-search/cli/src/cli.ts search -q "economía circular" -l "Bogotá"

# Everything that is open, first page
bun run .agents/skills/anthesis-search/cli/src/cli.ts search --format table

# Full text of one posting
bun run .agents/skills/anthesis-search/cli/src/cli.ts detail 554981 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default: programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single posting's full text (`detail` command) |

Search JSON is `{ "meta": { "count", "page", "total" }, "results": [...] }`; `total` is the
number of matches after the query and location filters. Each result has `id`, `title`,
`company`, `location`, `date`, `deadline`, `employmentType`, `workplaceType`, `department`,
`requisitionId`, `salary`, `url`; missing values are `null`. `detail` adds `sections` and a
joined `description`.

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- **One employer, about 50 roles worldwide.** Only a handful are in Colombia at any time; `-l "Colombia"` is the useful default.
- **`date` is always `null`.** The feed carries no publication date, so `--jobage` cannot filter. When it is passed, the JSON `meta` carries `"jobage": "unsupported"` and all matches are returned. `deadline` is filled when the posting sets one.
- **Postings are multilingual.** A keyword only matches postings written in that language: "sostenibilidad" misses English postings, "sustainability" misses Spanish ones. For full coverage of a country, filter by `--location` and omit `--query`.
- **Search is client-side.** One request returns every posting with its full text; the CLI filters and pages locally.
- `workplaceType` and `employmentType` are the site's Spanish labels ("Hibrido", "Permanente - Jornada completa").
- `salary` is filled only when the posting chooses to show compensation; most do not.
- Applying happens on the posting page; this skill only reads postings.
