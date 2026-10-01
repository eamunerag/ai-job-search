import {
  buildSearchUrl,
  jsonFetch,
  localISODate,
  parseSearchPage,
  resolveLocation,
  writeError,
  type JobCard,
  type LocationFilter,
} from "../helpers.js"

export interface SearchOpts {
  query: string
  location?: string
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 44).padEnd(44)
    const company = (c.company || "—").slice(0, 22).padEnd(22)
    const loc = (c.location || "—").slice(0, 24).padEnd(24)
    const date = c.date || "—"
    return `${c.id.padEnd(12)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(12) + " " + "TITLE".padEnd(44) + " " + "PROVIDER".padEnd(22) + " " + "LOCATION".padEnd(24) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

/** Keep vacancies posted within `days`; a vacancy with no date is kept. */
export function filterByAge(cards: JobCard[], days: number | undefined, now: Date = new Date()): JobCard[] {
  if (days === undefined) return cards
  const cutoff = localISODate(new Date(now.getTime() - days * 86400000))
  return cards.filter((c) => c.date === null || c.date >= cutoff)
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    let location: LocationFilter | null = null
    let page = null
    if (opts.location) {
      // The API matches place names literally, so the name is resolved against
      // the places the API reports for this query before filtering by it.
      const probe = parseSearchPage(await jsonFetch(buildSearchUrl(opts.query, 1)))
      location = resolveLocation(opts.location, probe.municipalities, probe.departments)
      if (!location) page = { ...probe, cards: [], total: 0, totalPages: 0 }
    }
    if (!page) page = parseSearchPage(await jsonFetch(buildSearchUrl(opts.query, opts.page, location)))

    let cards = filterByAge(page.cards, opts.jobage)
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}${c.salary ? ` · ${c.salary}` : ""}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: {
              count: cards.length,
              page: opts.page,
              total: page.total,
              totalPages: page.totalPages,
              location: location?.value ?? null,
            },
            results: cards,
          },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
