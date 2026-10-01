# Anthesis Group Careers (Pinpoint) URL Reference

Public, unauthenticated endpoint used by this skill. Investigated 2026-10-01.

> Personal use only: keep volume low.

## Access rules

`https://anthesisgroup.pinpointhq.com/robots.txt` (HTTP 200):

```
User-Agent: *
Disallow: /mydata
Disallow: /admin
Disallow: /companies
```

The feed and posting paths below are not disallowed. The site's terms of use were not
reviewed for automated access. No login is needed, and the site answers the honest
`Mozilla/5.0 (compatible; anthesis-cli/1.0)` user agent with HTTP 200.

## Feed (search and detail)

```
GET https://anthesisgroup.pinpointhq.com/es/postings.json
```

Returns `{ "data": [...] }` with **every** open posting and its full text (about 400 KB,
50 postings when investigated). There are no query parameters: `?page=2` returns the same
document, and there is no server-side keyword or location filter. The CLI filters and pages
client-side, and `detail` reads the same feed.

The language prefix (`/es/`, `/en/`, or none) only changes the `url`/`path` values and the
translated labels (`employment_type_text`, `workplace_type_text`); posting bodies stay in
the language they were written in.

Each record:

| Field | Maps to |
|-------|---------|
| `id` | `id` (numeric string) |
| `title` | `title` |
| `path` | `url` (`https://anthesisgroup.pinpointhq.com` + path, e.g. `/es/postings/<uuid>`) |
| `location.name`, `location.city` | `location` ("Bogotá D.C, Colombia"; the city is dropped when the name already contains it, as in "UK - London") |
| `deadline_at` | `deadline` (ISO timestamp cut to the day; usually `null`) |
| `employment_type_text`, `workplace_type_text` | `employmentType`, `workplaceType` |
| `job.department.name`, `job.requisition_id` | `department`, `requisitionId` |
| `compensation*` | `salary`, only when `compensation_visible` is `true` |
| `description` | first `sections[]` entry (HTML) |
| `key_responsibilities_header` / `key_responsibilities` | section with heading (HTML) |
| `skills_knowledge_expertise_header` / `skills_knowledge_expertise` | section with heading (HTML) |
| `benefits_header` / `benefits` | section with heading (HTML) |

There is no publication date anywhere in the record, so `date` is always `null`.

## Posting page

```
https://anthesisgroup.pinpointhq.com/es/postings/<uuid>
```

The human-readable posting and its apply form. The CLI does not fetch it (the feed already
has the text); `detail` accepts this URL and matches its UUID against the feed.

## Quirks

- The HTML bodies are Trix editor output: `<div><!--block-->...</div>` blocks, `<br>` line breaks, `<ul><li>` lists. `htmlToText` drops the comments, removes inline tags without leaving gaps, and turns list items into "- " lines.
- The careers home page (`/es`) renders its list with JavaScript and contains no posting links in the raw HTML; use the feed.
- Other Pinpoint-hosted careers sites expose the same `/postings.json` feed, so this CLI is a template for them: change `BASE_URL` and `COMPANY` in `cli/src/helpers.ts`.
