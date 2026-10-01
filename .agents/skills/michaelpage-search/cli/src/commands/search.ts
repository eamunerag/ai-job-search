import {
  buildSearchUrl,
  htmlFetch,
  parseJobTiles,
  parseLocationFacets,
  parseTotal,
  resolveLocation,
  searchPath,
  writeError,
  type JobCard,
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
    const title = (c.title || "").slice(0, 50).padEnd(50)
    const loc = (c.location || "—").slice(0, 18).padEnd(18)
    const contract = (c.contractType || "—").slice(0, 11).padEnd(11)
    const salary = (c.salary || "—").slice(0, 28)
    return `${c.id.padEnd(18)} ${title} ${loc} ${contract} ${salary}`
  })
  const header =
    "ID".padEnd(18) + " " + "TITLE".padEnd(50) + " " + "LOCATION".padEnd(18) + " " + "CONTRACT".padEnd(11) + " SALARY"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    let path = searchPath(opts.query)
    let locationName: string | null = null
    let html: string | null = null
    if (opts.location) {
      // Locations are path segments with site-specific slugs ("bogotá-0"), so
      // the right one is read from the filter links on the unfiltered results.
      const facet = resolveLocation(opts.location, parseLocationFacets(await htmlFetch(buildSearchUrl(path, 1))))
      if (facet) {
        path = facet.path
        locationName = facet.name
      } else {
        html = ""
      }
    }
    // Posting age cannot be filtered (the list has no dates); --jobage sorts newest first instead.
    if (html === null) html = await htmlFetch(buildSearchUrl(path, opts.page, opts.jobage !== undefined))

    let cards = parseJobTiles(html)
    const total = parseTotal(html) ?? cards.length
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.location || "—"} · ${c.contractType || "—"}${c.salary ? ` · ${c.salary}` : ""}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      const meta: Record<string, unknown> = { count: cards.length, page: opts.page, total, location: locationName }
      if (opts.jobage !== undefined) meta.jobage = "unsupported (sorted newest first instead)"
      process.stdout.write(JSON.stringify({ meta, results: cards }, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
