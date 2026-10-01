// Data source: Michael Page Colombia's public, server-rendered job search.
// No authentication. Keyword, location and paging are server-side; the results
// list carries no posting date (only the job page does). Parsed with regex;
// no runtime dependencies.

export const BASE_URL = "https://www.michaelpage.com.co"
export const PAGE_SIZE = 30

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; michaelpage-cli/1.0)"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-CO,es;q=0.9",
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
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  salary: string | null
  contractType: string | null
  summary: string | null
  url: string
}

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  salary: string | null
  contractType: string | null
  sector: string | null
  consultant: string | null
  url: string
  applyUrl: string
  description: string | null
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", Uuml: "Ü",
  iquest: "¿", iexcl: "¡", ndash: "–", mdash: "—",
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name] ?? m)
}

export function clean(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
}

/** HTML fragment -> readable text, keeping line breaks and marking list items. */
export function htmlToText(html: string): string {
  const withBreaks = html
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

/** "07/09/2026" -> "2026-09-07". */
export function dmyToISO(raw: string | null | undefined): string | null {
  if (!raw) return null
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null
}

/** Search results path for a keyword, e.g. "/jobs/sostenibilidad". */
export function searchPath(query: string): string {
  return `/jobs/${encodeURIComponent(query.trim())}`
}

/** `page` is 1-indexed here; the site's own parameter is 0-indexed. */
export function buildSearchUrl(path: string, page: number, newestFirst = false): string {
  const params = new URLSearchParams()
  if (newestFirst) params.set("sort_by", "most_recent")
  if (page > 1) params.set("page", String(page - 1))
  const qs = params.toString()
  return `${BASE_URL}${path}${qs ? `?${qs}` : ""}`
}

// "/job-detail/<slug>/ref/jn-092026-7098494"
const JOB_PATH = /^\/job-detail\/[^/"?#]+\/ref\/([a-z0-9-]+)$/i

/** The text of the first element carrying `class="<cls>"`, up to its closing tag. */
function byClass(html: string, cls: string, tag: string): string | null {
  const m = html.match(new RegExp(`class="${cls}"[^>]*>([\\s\\S]*?)</${tag}>`, "i"))
  const v = m ? clean(m[1]) : ""
  return v || null
}

/**
 * Parse the results list. Each job is one tile opening with
 * `<div about="/job-detail/...">`; tiles are parsed one by one, so one
 * malformed tile cannot break the rest. "Recommended" tiles, which the site
 * appends when a search has few matches, are not results and are skipped.
 */
export function parseJobTiles(html: string): JobCard[] {
  const results: JobCard[] = []
  const seen = new Set<string>()
  for (const chunk of html.split(/<div about="(?=\/job-detail\/)/i).slice(1)) {
    const head = chunk.match(/^([^"]+)"\s+class="([^"]*)"/)
    if (!head || !/\bsearch-job-tile\b/.test(head[2]) || /\brecommended-job-tile\b/.test(head[2])) continue
    const path = head[1]
    const ref = path.match(JOB_PATH)
    if (!ref) continue
    const id = ref[1].toUpperCase()
    if (seen.has(id)) continue

    const h3 = chunk.match(/<h3>\s*<a\b[^>]*>([\s\S]*?)<\/a>/i)
    const title = h3 ? clean(h3[1]) : ""
    if (!title) continue
    seen.add(id)

    results.push({
      id,
      title,
      // A recruiter's adverts never name the client.
      company: null,
      location: byClass(chunk, "job-location", "div"),
      date: null,
      salary: byClass(chunk, "job-salary", "div"),
      contractType: byClass(chunk, "job-contract-type", "div"),
      summary: byClass(chunk, "job_advert__job-summary-text", "div"),
      url: `${BASE_URL}${path}`,
    })
  }
  return results
}

/** The "N" in the results heading; null when the page has none. */
export function parseTotal(html: string): number | null {
  const m = html.match(/class="total-search no-of-jobs">\s*<span>\s*([\d.,]+)/i)
  return m ? parseInt(m[1].replace(/[.,]/g, ""), 10) : null
}

export interface LocationFacet {
  name: string
  count: number
  path: string
}

/** The location filter links offered on a results page. */
export function parseLocationFacets(html: string): LocationFacet[] {
  const out: LocationFacet[] = []
  const re =
    /data-drupal-facet-item-id="location-\d+"[^>]*?data-drupal-facet-item-count="(\d+)"[^>]*?data-url="([^"]+)"[^>]*>\s*<span class="facet-item__value">([\s\S]*?)<\/span>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const path = decodeHtmlEntities(m[2])
    // Only "/jobs/<keyword>/<place>": deeper paths are off limits in robots.txt.
    if (!/^\/jobs\/[^/?#]+\/[^/?#]+$/.test(path)) continue
    const name = clean(m[3])
    if (name) out.push({ name, count: parseInt(m[1], 10), path: encodeURI(decodeURI(path)) })
  }
  return out
}

/** Pick the facet matching free text ("bogota" -> "Bogotá"): an exact name wins over a prefix. */
export function resolveLocation(input: string, facets: LocationFacet[]): LocationFacet | null {
  const needle = fold(input).replace(/[.,]/g, " ").replace(/\s+/g, " ").trim()
  if (!needle) return null
  const names = facets.map((f) => ({ f, n: fold(f.name).replace(/[.,]/g, " ").replace(/\s+/g, " ").trim() }))
  return (
    names.find((x) => x.n === needle)?.f ??
    names.filter((x) => x.n.startsWith(needle + " ")).sort((a, b) => b.f.count - a.f.count)[0]?.f ??
    null
  )
}

/** Parse a job page. Returns null when it holds no job. */
export function parseDetail(html: string, url: string): JobDetail | null {
  const path = url.replace(BASE_URL, "")
  const ref = path.match(JOB_PATH)
  const h1 = html.match(/<h1 class="job-apply-job-title">([\s\S]*?)<\/h1>/i)
  const title = h1 ? clean(h1[1]) : ""
  if (!ref || !title) return null

  // The header block holds location, contract and salary as spans.
  const header = html.slice(html.indexOf('class="job-apply-fields"'))
  const sections: string[] = []
  const bullets = html.match(/<div id="description"[\s\S]*?class="job_advert__job-desc-bullet-points">([\s\S]*?)<\/div>/i)
  if (bullets) {
    const text = htmlToText(bullets[1])
    if (text) sections.push(text)
  }
  // Each part of the advert is an <h2> heading followed by a job_advert__job-desc-* block.
  const partRe =
    /<h2 class="[^"]*field--label[^"]*">([\s\S]*?)<\/h2>\s*<div class="accordion-tab-content">\s*<div class="job_advert__job-desc-[a-z-]+">([\s\S]*?)<\/div>\s*<\/div>/gi
  let m: RegExpExecArray | null
  while ((m = partRe.exec(html)) !== null) {
    const heading = clean(m[1])
    const text = htmlToText(m[2])
    if (text) sections.push(heading ? `${heading}:\n${text}` : text)
  }

  // "Resumen de empleo": <dt>label</dt><dd>value</dd> pairs. Labels repeat (two "Sector" rows), so keep the first.
  const summary: Record<string, string> = {}
  const pairRe = /<dt class="field--label[^"]*">([\s\S]*?)<\/dt>\s*<dd class="field--item[^"]*"[^>]*>([\s\S]*?)<\/dd>/gi
  while ((m = pairRe.exec(html)) !== null) {
    const label = fold(clean(m[1]))
    const value = clean(m[2])
    if (label && value && !(label in summary)) summary[label] = value
  }

  return {
    id: ref[1].toUpperCase(),
    title,
    company: null,
    location: byClass(header, "job-location", "span") ?? summary["ubicacion"] ?? null,
    date: dmyToISO(html.match(/class="job-posted-date">([\s\S]*?)<\/p>/i)?.[1]),
    salary: byClass(header, "job-salary", "span"),
    contractType: byClass(header, "job-contract-type", "span") ?? summary["tipo de trabajo"] ?? null,
    sector: summary["sector"] ?? null,
    consultant: summary["nombre del consultor"] ?? null,
    url,
    applyUrl: `${BASE_URL}${path.replace(/^\/job-detail\//, "/job-apply/")}`,
    description: sections.join("\n\n") || null,
  }
}
