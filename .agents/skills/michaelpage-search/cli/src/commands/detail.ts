import { BASE_URL, buildSearchUrl, htmlFetch, parseDetail, parseJobTiles, searchPath, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const PORTAL_HOST = /^(www\.)?michaelpage\.com\.co$/i
const REF = /^jn-\d{6}-\d+$/i

export type JobRef = { kind: "ref"; value: string } | { kind: "url"; value: string }

/**
 * Accept a job reference ("JN-092026-7098494") or a job URL on Michael Page
 * Colombia. A URL on any other host is rejected, so a link from another site
 * can never be read as a Michael Page job.
 */
export function normalizeId(input: string): JobRef | null {
  const trimmed = input.trim()
  if (REF.test(trimmed)) return { kind: "ref", value: trimmed.toUpperCase() }

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (hasScheme || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    } catch {
      return null
    }
    if (!PORTAL_HOST.test(parsed.hostname)) return null
    const m = parsed.pathname.match(/^\/job-detail\/[^/]+\/ref\/(jn-\d{6}-\d+)\/?$/i)
    return m ? { kind: "url", value: `${BASE_URL}${parsed.pathname.replace(/\/$/, "")}` } : null
  }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const ref = normalizeId(opts.id)
  if (!ref) {
    writeError(`Could not parse a Michael Page job reference from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    let url: string | undefined
    if (ref.kind === "url") {
      url = ref.value
    } else {
      // A job page's address includes a title slug the reference alone does
      // not give, so the reference is looked up through the search first.
      const tiles = parseJobTiles(await htmlFetch(buildSearchUrl(searchPath(ref.value.toLowerCase()), 1)))
      url = tiles.find((t) => t.id === ref.value)?.url
    }
    const html = url ? await htmlFetch(url) : ""
    const job = html && url ? parseDetail(html, url) : null
    if (!job) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }

    if (opts.format === "plain") {
      const facts: Array<[string, string | null]> = [
        ["Ubicación", job.location],
        ["Tipo de trabajo", job.contractType],
        ["Salario", job.salary],
        ["Sector", job.sector],
        ["Publicada", job.date],
        ["Consultor", job.consultant],
      ]
      const lines = [
        job.title,
        `Michael Page · ref ${job.id}`,
        ...facts.filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`),
        "",
        job.description || "(sin descripción)",
        "",
        `URL: ${job.url}`,
        `Aplicar: ${job.applyUrl}`,
      ]
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
