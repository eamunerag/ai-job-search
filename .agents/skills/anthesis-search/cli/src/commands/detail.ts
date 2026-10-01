import { FEED_URL, jsonFetch, parsePostings, writeError, type Posting } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const PORTAL_HOST = /^anthesisgroup\.pinpointhq\.com$/i
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export type PostingRef = { kind: "id"; value: string } | { kind: "uuid"; value: string }

/**
 * Accept a numeric posting id or a posting URL on the Anthesis careers site.
 * A URL on any other host is rejected, so a link from another site can never
 * be read as an Anthesis posting.
 */
export function normalizeId(input: string): PostingRef | null {
  const trimmed = input.trim()
  if (/^\d{3,}$/.test(trimmed)) return { kind: "id", value: trimmed }

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (hasScheme || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    } catch {
      return null
    }
    if (!PORTAL_HOST.test(parsed.hostname)) return null
    const m = parsed.pathname.match(new RegExp(`/postings/(${UUID.source})(?:/|$)`, "i"))
    return m ? { kind: "uuid", value: m[1].toLowerCase() } : null
  }
  return null
}

export function findPosting(postings: Posting[], ref: PostingRef): Posting | undefined {
  return ref.kind === "id"
    ? postings.find((p) => p.id === ref.value)
    : postings.find((p) => p.url.toLowerCase().endsWith(`/postings/${ref.value}`))
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const ref = normalizeId(opts.id)
  if (!ref) {
    writeError(`Could not parse an Anthesis posting id from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    // The feed already carries each posting's full text; there is no lighter per-posting endpoint.
    const job = findPosting(parsePostings(await jsonFetch(FEED_URL)), ref)
    if (!job) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }

    if (opts.format === "plain") {
      const facts = [
        job.location,
        job.workplaceType,
        job.employmentType,
        job.department,
        job.requisitionId ? `ref ${job.requisitionId}` : null,
      ].filter(Boolean)
      const lines = [
        job.title,
        `${job.company} · ${facts.join(" · ")}`,
        ...(job.salary ? [`Salary: ${job.salary}`] : []),
        ...(job.deadline ? [`Deadline: ${job.deadline}`] : []),
        "",
        ...job.sections.flatMap((s) => [...(s.heading ? [s.heading.toUpperCase()] : []), s.text, ""]),
        `URL: ${job.url}`,
      ]
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      const description = job.sections.map((s) => (s.heading ? `${s.heading}\n${s.text}` : s.text)).join("\n\n") || null
      process.stdout.write(JSON.stringify({ ...job, description }, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
