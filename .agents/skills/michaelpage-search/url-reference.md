# Michael Page Colombia URL Reference

Public, unauthenticated pages used by this skill. Investigated 2026-10-01.

> Personal use only: keep volume low.

## Access rules

`https://www.michaelpage.com.co/robots.txt` (HTTP 200) is a Drupal file with site-specific
additions. For `User-agent: *`, the rules that matter here:

| Rule | Effect on this skill |
|------|----------------------|
| `Disallow: /search/`, `Disallow: /*/search/` | Not used; search goes through `/jobs/<keyword>` |
| `Disallow: */jobs/*/*/*/` | Paths three levels below `/jobs/` are off limits; the CLI only follows `/jobs/<keyword>` and `/jobs/<keyword>/<place>` |
| `Disallow: /job-apply/`, `/job-apply-external/` | Never fetched; `applyUrl` is only reported |
| `Disallow: /*?*contract=temp`, `contract=permanent`, `salary_range`, `field_job_salary_min/max`, `brand=`, `item_per_pages`, `cts=true` | These filters are not offered |
| `/job-detail/...`, `?page=`, `?sort_by=` | Not disallowed |

`python tools/robots_check.py` reports `ALLOWED` for `/jobs/<keyword>`. The site's terms of
use were not reviewed for automated access. The site answers the honest
`Mozilla/5.0 (compatible; michaelpage-cli/1.0)` user agent with HTTP 200.

## Search

```
GET https://www.michaelpage.com.co/jobs/<keyword>
GET https://www.michaelpage.com.co/jobs/<keyword>/<place-slug>
```

| Part | Meaning | Example |
|------|---------|---------|
| `<keyword>` | Free text, URL-encoded (spaces as `%20`; hyphens give the same result) | `sostenibilidad`, `ingeniero%20de%20procesos` |
| `<place-slug>` | Location, as the site's own slug | `bogotá-0`, `barranquilla`, `cundinamarca` |
| `?page=<n>` | **0-indexed** page, 30 results each (`--page 2` sends `page=1`) | `?page=1` |
| `?sort_by=` | `relevance` (default), `most_recent`, `max_to_min`, `min_to_max` | `?sort_by=most_recent` |

A search with no matches returns **HTTP 404** with an empty results page; the CLI reads
that as zero results.

Place slugs cannot be derived from the name (Bogotá is `bogotá-0`), so `--location` is
resolved from the facet links on the unfiltered results page:

```html
<span data-drupal-facet-item-id="location-4316" data-drupal-facet-item-value="4316"
      data-drupal-facet-item-count="17" data-url="/jobs/ingeniero/bogotá-0">
  <span class="facet-item__value">Bogotá</span> ...
```

Result tiles (server-rendered, one per `<li class="views-row">`):

| Field | Anchor |
|-------|--------|
| tile start | `<div about="/job-detail/<slug>/ref/<ref>" class="job-tile search-job-tile">` |
| id | `<ref>` from that path, upper-cased (`JN-092026-7098494`) |
| url | `https://www.michaelpage.com.co` + the `about` path |
| title | `<h3><a ...>TITLE</a></h3>` |
| location | `<div class="job-location">` |
| contract | `<div class="job-contract-type">` |
| salary | `<div class="job-salary">` (absent on some adverts) |
| summary | `<div class="job_advert__job-summary-text">` |
| total | `<span class="total-search no-of-jobs"><span>N</span></span>` |

Tiles with class `job-tile recommended-job-tile search-job-tile` are padding the site adds
when a search has few matches; they are skipped. The numeric `id="1840911"` on the title
`<div>` is an internal node id with no public URL, so the reference is used as the id.

The results list has no posting date.

## Detail

```
GET https://www.michaelpage.com.co/job-detail/<slug>/ref/<ref>
```

The slug is required: `/job-detail/x/ref/<ref>` returns 404. Given only a reference,
`detail` first requests `/jobs/<ref>` (the search finds a job by its reference) and takes
the URL from the matching tile.

| Field | Anchor |
|-------|--------|
| title | `<h1 class="job-apply-job-title">` |
| location, contract, salary | `<span class="job-location">`, `job-contract-type`, `job-salary` after `class="job-apply-fields"` |
| posting date | `<p class="job-posted-date"> Fecha de publicación DD/MM/YYYY</p>` |
| key points | `job_advert__job-desc-bullet-points` inside `<div id="description">` |
| advert parts | `<h2 class="field--label accordion-tab-title">HEADING</h2><div class="accordion-tab-content"><div class="job_advert__job-desc-company\|role\|candidate\|deal">` |
| sector, consultant | "Resumen de empleo" `<dt class="field--label ...">LABEL</dt><dd class="field--item ...">VALUE</dd>` pairs |
| apply link | same path with `/job-apply/` in place of `/job-detail/` (reported, never fetched) |

## Quirks

- One `<h2>` carries `class=" field--label ..."` with a leading space; the heading regex allows for it.
- "Resumen de empleo" lists "Sector" twice (sector and industry); the first is kept.
- The page also embeds a schema.org `JobPosting` JSON-LD block, but its `description` holds raw line breaks, which is invalid JSON, so the HTML anchors are used instead.
- The same markup serves other Michael Page country sites (`michaelpage.com.mx`, `.cl`, ...), each with its own robots.txt to check; change `BASE_URL` in `cli/src/helpers.ts`.
