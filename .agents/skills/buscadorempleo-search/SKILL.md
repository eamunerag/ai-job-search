---
name: buscadorempleo-search
version: 1.0.0
description: >
  Use this skill to search for jobs in Colombia on the Buscador de Empleo
  (buscadordeempleo.gov.co), the national vacancy aggregator of the Servicio Público de
  Empleo (SPE), or to read a specific vacancy by its code. It pools vacancies from every
  authorised provider (Computrabajo, elempleo, Magneto, Comfama, Compensar, SENA and
  others). Postings are in Spanish. Invoke for vacancies in Bogotá or anywhere in Colombia.
  Trigger phrases: Buscador de Empleo, Servicio Público de Empleo, SPE Colombia, public
  employment service jobs Colombia, jobs in Colombia, buscar empleo, ofertas de empleo,
  vacantes, vacantes en Bogotá, empleo en Colombia, bolsa de empleo, "hay vacantes de X en
  el Servicio de Empleo", ver esta vacante del buscador de empleo.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/buscadorempleo-search/cli/src/cli.ts *)
---

# Buscador de Empleo (Servicio Público de Empleo) Search Skill

Search live vacancies from Colombia's national vacancy aggregator. No authentication,
no API key, and **zero runtime dependencies**: it runs with just `bun`.

## ⚠️ Personal use only

This reads the JSON API behind the portal's own public search page. The site publishes no
`robots.txt` (checked 2026-10-01) and its terms of use were not reviewed for automated
access. It is a free public service, so **keep volume low and don't use it commercially or
for bulk data collection.** Use is your own responsibility.

## When to use this skill

- Search vacancies across all SPE providers by keyword, optionally in one municipality or department
- Keep only recent vacancies (posted within N days)
- Read one vacancy's conditions and find the provider page where you apply

## Commands

### Search vacancies

```bash
bun run .agents/skills/buscadorempleo-search/cli/src/cli.ts search --query "<text>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>`: **required.** Keyword(s). Write without accents (see Notes).
- `--location <text>` / `-l <text>`: municipality or department, e.g. `"Bogotá"`, `"Medellín"`, `"Antioquia"`. Accents and case are ignored. Costs one extra request (see Notes).
- `--jobage <days>`: posted within N days. Applied client-side to the fetched page; results come newest first.
- `--page <n>`: page number (1-indexed, 50 results per page).
- `--limit <n>` / `-n <n>`: cap total results emitted (client-side).
- `--format json|table|plain`: default `json`.

### Fetch one vacancy

```bash
bun run .agents/skills/buscadorempleo-search/cli/src/cli.ts detail <id> [--format json|plain]
```

`id` is the vacancy code ("código de la oferta") from `search` results, e.g. `1081300`.
The portal has no per-vacancy URL, so only the code is accepted. Returns the conditions
(salary band, contract type, education, experience, remote, closing date), the description
excerpt and the provider link(s).

## Usage examples

```bash
# Sustainability roles in Bogotá
bun run .agents/skills/buscadorempleo-search/cli/src/cli.ts search -q "sostenibilidad" -l "Bogotá" --format table

# Circular-economy roles anywhere in Colombia, last 14 days
bun run .agents/skills/buscadorempleo-search/cli/src/cli.ts search -q "economia circular" --jobage 14 --format table

# Packaging roles in Antioquia (a department)
bun run .agents/skills/buscadorempleo-search/cli/src/cli.ts search -q "empaques" -l "Antioquia" --format table

# Second page of environmental roles in Bogotá, JSON with salary band and contract type
bun run .agents/skills/buscadorempleo-search/cli/src/cli.ts search -q "ambiental" -l "Bogotá" --page 2

# One vacancy
bun run .agents/skills/buscadorempleo-search/cli/src/cli.ts detail 1081300 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default: programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single vacancy (`detail` command) |

Search JSON is `{ "meta": { "count", "page", "total", "totalPages", "location" }, "results": [...] }`;
`total` is the portal's match count and `location` is the exact place name the filter
resolved to (or `null`). Each result has `id`, `title`, `company`, `location`, `date`,
`deadline`, `salary`, `contractType`, `educationLevel`, `remote`, `experienceMonths`,
`openings`, `description`, `providers`, `url`; missing values are `null`.

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- **`company` is the provider, not the employer.** The portal names the employment-service provider that published the vacancy ("COMPUTRABAJO", "MAGNETO GLOBAL S.A.S."); the employer appears, if at all, on the provider's page.
- **`url` points to the provider's site**, where the full posting lives and where you apply. If a vacancy has no provider link, `url` falls back to the portal home.
- **The description is an excerpt** of about 1,000 characters with line breaks removed by the portal. Open `url` for the full text.
- **Search is broad.** The keyword is matched against the whole vacancy text, so "sostenibilidad" also returns roles that only mention it in passing. Read the titles.
- **Write queries without accents** ("economia circular"); the portal itself recommends it and indexes text accent-free.
- **`--location` costs a second request.** The API only accepts its own exact place names ("BOGOTÁ, D.C."), so the CLI first reads the places available for the query, then filters. A place with no vacancies for that query returns zero results.
- **`--jobage` filters only the fetched page.** Results arrive newest first, so page 1 holds the most recent 50.
- Salaries are bands ("$3.000.001 - $4.000.000") or "A Convenir".
- The server sends an incomplete TLS certificate chain; the CLI carries the missing public DigiCert intermediate so verification stays on. See `url-reference.md` if requests start failing with a certificate error.
- This aggregator overlaps with the `computrabajo-search`, `elempleo-search` and `sena-search` skills; expect duplicates across them.
