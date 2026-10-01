import {
  FEED_URL,
  PAGE_SIZE,
  filterByLocation,
  filterByQuery,
  jsonFetch,
  parsePostings,
  toCard,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 52).padEnd(52)
    const loc = (c.location || "—").slice(0, 26).padEnd(26)
    const mode = (c.workplaceType || "—").slice(0, 8).padEnd(8)
    const type = c.employmentType || "—"
    return `${c.id.padEnd(8)} ${title} ${loc} ${mode} ${type}`
  })
  const header = "ID".padEnd(8) + " " + "TITLE".padEnd(52) + " " + "LOCATION".padEnd(26) + " " + "MODE".padEnd(8) + " TYPE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    // The feed returns every open posting; filter and page here.
    const all = filterByLocation(filterByQuery(parsePostings(await jsonFetch(FEED_URL)), opts.query), opts.location)
    let cards = all.slice((opts.page - 1) * PAGE_SIZE, opts.page * PAGE_SIZE).map(toCard)
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.location || "—"} · ${c.workplaceType || "—"} · ${c.employmentType || "—"}${c.deadline ? ` · cierra ${c.deadline}` : ""}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      const meta: Record<string, unknown> = { count: cards.length, page: opts.page, total: all.length }
      // The feed has no publication date, so posting age cannot be applied.
      if (opts.jobage !== undefined) meta.jobage = "unsupported"
      process.stdout.write(JSON.stringify({ meta, results: cards }, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
