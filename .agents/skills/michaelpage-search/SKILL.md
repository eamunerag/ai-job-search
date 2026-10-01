---
name: michaelpage-search
version: 1.0.0
description: >
  Use this skill to search for jobs in Colombia on Michael Page Colombia
  (michaelpage.com.co), the recruitment firm's job board for professional and management
  roles, or to read a specific Michael Page job. Postings are in Spanish (a few in
  English). Invoke for mid-to-senior roles in Bogotá, Medellín or anywhere in Colombia.
  Trigger phrases: Michael Page jobs, Michael Page Colombia, recruiter jobs Colombia,
  headhunter roles, PageGroup, empleos Michael Page, ofertas de empleo Michael Page,
  vacantes Michael Page, ofertas de empleo, vacantes en Bogotá, cazatalentos, "hay
  vacantes de X en Michael Page", ver esta oferta de Michael Page.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/michaelpage-search/cli/src/cli.ts *)
---

# Michael Page Colombia Search Skill

Search live jobs from Michael Page Colombia's public job board. No authentication, no API
key, and **zero runtime dependencies**: it runs with just `bun`.

## ⚠️ Personal use only

This reads Michael Page's public job pages. Its `robots.txt` permits the paths used here
(checked 2026-10-01) and disallows others, which this skill stays out of (see Notes); the
site's terms of use were not reviewed for automated access. **Keep volume low and don't
use it commercially or for bulk data collection.** Use is your own responsibility.

## When to use this skill

- Search Michael Page Colombia jobs by keyword, optionally in one city or department
- See salary ranges, which Michael Page publishes on most adverts
- Read a job's full description, requirements, posting date and consultant

## Commands

### Search jobs

```bash
bun run .agents/skills/michaelpage-search/cli/src/cli.ts search --query "<text>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>`: **required.** Keyword(s), e.g. `"sostenibilidad"`, `"ingeniero"`.
- `--location <text>` / `-l <text>`: city or department as the site names it, e.g. `"Bogotá"`, `"Antioquia"`. Accents and case are ignored. Costs one extra request (see Notes).
- `--jobage <days>`: **cannot filter** (the results list has no dates); it sorts newest first instead.
- `--page <n>`: page number (1-indexed, 30 results per page).
- `--limit <n>` / `-n <n>`: cap total results emitted (client-side).
- `--format json|table|plain`: default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/michaelpage-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the job reference from `search` results, e.g. `JN-092026-7098494`. A full
`michaelpage.com.co/job-detail/...` URL also works and saves one request.

## Usage examples

```bash
# Sustainability roles anywhere in Colombia
bun run .agents/skills/michaelpage-search/cli/src/cli.ts search -q "sostenibilidad" --format table

# Engineering roles in Bogotá
bun run .agents/skills/michaelpage-search/cli/src/cli.ts search -q "ingeniero" -l "Bogotá" --format table

# Newest management roles first
bun run .agents/skills/michaelpage-search/cli/src/cli.ts search -q "gerente" --jobage 14 --format table

# Environmental roles, JSON with salary and summary
bun run .agents/skills/michaelpage-search/cli/src/cli.ts search -q "ambiental" --limit 10

# Full details for one job
bun run .agents/skills/michaelpage-search/cli/src/cli.ts detail JN-092026-7098494 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default: programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

Search JSON is `{ "meta": { "count", "page", "total", "location" }, "results": [...] }`;
`total` is the site's match count and `location` is the place name the filter resolved to
(or `null`). Each result has `id`, `title`, `company`, `location`, `date`, `salary`,
`contractType`, `summary`, `url`; missing values are `null`. `detail` returns `id`, `title`,
`company`, `location`, `date`, `salary`, `contractType`, `sector`, `consultant`, `url`,
`applyUrl`, `description`.

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- **`company` is always `null`.** Michael Page is a recruiter and never names its client; the advert describes it ("Empresa del sector de Energía").
- **`date` is `null` in search results.** Only the job page shows the posting date, so `detail` fills it. `--jobage` therefore cannot filter; it switches the sort to newest first and the JSON `meta` says so.
- **Search is full-text and loose.** "sostenibilidad" also returns jobs that mention it once. With few matches the site pads the page with "recommended" jobs; the CLI drops those.
- **The board is small** (tens of jobs per keyword). Broad single words work best; a long phrase often returns nothing.
- **`--location` costs a second request.** Locations are path segments with site-specific slugs ("bogotá-0"), so the CLI reads the location filter links from the unfiltered results first. A place with no jobs for that query returns zero results.
- **`detail` by reference costs a second request**, because the job URL contains a title slug; pass the `url` from search results to avoid it.
- Salaries are monthly and yearly ranges in COP ("COP5,000,000 - COP5,400,000 por mes (...)").
- **robots.txt boundaries respected:** the skill never requests `/search/`, `/job-apply/`, paths three levels below `/jobs/`, or URLs with the `contract=`, `salary_range`, `brand=` or `item_per_pages` parameters, all of which the site disallows. `applyUrl` is returned for you to open in a browser; the CLI does not fetch it.
