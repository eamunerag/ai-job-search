// Data source: the public postings feed of Anthesis Group's careers site,
// hosted on Pinpoint. No authentication. One GET returns every open posting
// with its full text, so keyword, location and paging are applied here,
// client-side. No runtime dependencies.

export const BASE_URL = "https://anthesisgroup.pinpointhq.com"
export const FEED_URL = `${BASE_URL}/es/postings.json`
export const COMPANY = "Anthesis Group"
export const PAGE_SIZE = 20

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; anthesis-cli/1.0)"

/** Fetch JSON with exponential backoff on 429/5xx. Returns null on a 404. */
export async function jsonFetch(url: string): Promise<unknown> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(45000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.json()
  }
  throw new Error("Request failed after max retries")
}

export interface Section {
  heading: string | null
  text: string
}

export interface Posting {
  id: string
  title: string
  company: string
  location: string | null
  date: string | null
  deadline: string | null
  employmentType: string | null
  workplaceType: string | null
  department: string | null
  requisitionId: string | null
  salary: string | null
  url: string
  sections: Section[]
}

/** A search result: a posting without its body text. */
export type JobCard = Omit<Posting, "sections">

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", Uuml: "Ü",
  iquest: "¿", iexcl: "¡", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m)
}

/** HTML fragment -> readable text, keeping line breaks and marking list items. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<!--[\s\S]*?-->/g, "")
    // Inline tags vanish without a gap, so "<strong>word</strong>." stays "word."
    .replace(/<\/?(strong|em|b|i|u|a|span)\b[^>]*>/gi, "")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div|ul|ol|h\d)>/gi, "\n")
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
}

/** Lowercase and strip accents, for accent-insensitive matching. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.replace(/\s+/g, " ").trim()
  return t || null
}

function obj(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {}
}

function salary(r: Record<string, unknown>): string | null {
  if (r.compensation_visible !== true) return null
  const text = str(r.compensation)
  if (text) return text
  const min = r.compensation_minimum
  const max = r.compensation_maximum
  if (typeof min !== "number" && typeof max !== "number") return null
  const range = [min, max].filter((n) => typeof n === "number").join(" - ")
  return [str(r.compensation_currency), range, str(r.compensation_frequency)].filter(Boolean).join(" ")
}

/** One feed record -> Posting. Returns null when the record has no id, title or URL. */
export function toPosting(raw: unknown): Posting | null {
  const r = obj(raw)
  const id = typeof r.id === "string" || typeof r.id === "number" ? String(r.id).trim() : ""
  const title = str(r.title)
  const path = str(r.path)
  if (!id || !title || !path || !path.startsWith("/")) return null

  const loc = obj(r.location)
  const city = str(loc.city)
  const place = str(loc.name)
  // "Colombia" + "Bogotá D.C" -> "Bogotá D.C, Colombia"; "UK - London" + "London" stays as is.
  const location = city && place && !fold(place).includes(fold(city)) ? `${city}, ${place}` : (place ?? city)

  const job = obj(r.job)
  const sections: Section[] = []
  const add = (heading: unknown, body: unknown) => {
    const text = typeof body === "string" ? htmlToText(body) : ""
    if (text) sections.push({ heading: str(heading), text })
  }
  add(null, r.description)
  add(r.key_responsibilities_header, r.key_responsibilities)
  add(r.skills_knowledge_expertise_header, r.skills_knowledge_expertise)
  add(r.benefits_header, r.benefits)

  return {
    id,
    title,
    company: COMPANY,
    location,
    // The feed carries no publication date.
    date: null,
    deadline: typeof r.deadline_at === "string" && /^\d{4}-\d{2}-\d{2}/.test(r.deadline_at) ? r.deadline_at.slice(0, 10) : null,
    employmentType: str(r.employment_type_text),
    workplaceType: str(r.workplace_type_text),
    department: str(obj(job.department).name),
    requisitionId: str(job.requisition_id),
    salary: salary(r),
    url: `${BASE_URL}${path}`,
    sections,
  }
}

/** Parse the feed. Records are converted one by one, so a malformed one cannot break the rest. */
export function parsePostings(raw: unknown): Posting[] {
  const data = obj(raw).data
  const out: Posting[] = []
  for (const item of Array.isArray(data) ? data : []) {
    const posting = toPosting(item)
    if (posting) out.push(posting)
  }
  return out
}

export function toCard(p: Posting): JobCard {
  const { sections: _sections, ...card } = p
  return card
}

/** Keep postings containing every word of `query` in the title, department, location or body (accents and case ignored). */
export function filterByQuery(postings: Posting[], query: string | undefined): Posting[] {
  const words = fold(query ?? "").split(/\s+/).filter(Boolean)
  if (words.length === 0) return postings
  return postings.filter((p) => {
    const haystack = fold(
      [p.title, p.department, p.location, p.workplaceType, p.employmentType, ...p.sections.map((s) => `${s.heading ?? ""} ${s.text}`)]
        .filter(Boolean)
        .join(" "),
    )
    return words.every((w) => haystack.includes(w))
  })
}

/** Keep postings whose location contains `location` (accents and case ignored). */
export function filterByLocation(postings: Posting[], location: string | undefined): Posting[] {
  if (!location) return postings
  const needle = fold(location).replace(/[.,]/g, " ").replace(/\s+/g, " ").trim()
  return postings.filter((p) => p.location !== null && fold(p.location).replace(/[.,]/g, " ").includes(needle))
}
