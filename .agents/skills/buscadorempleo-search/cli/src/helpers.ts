// Data source: the public JSON API behind buscadordeempleo.gov.co, the
// national vacancy aggregator of Colombia's Servicio Público de Empleo.
// No authentication. Keyword, municipality/department and paging are
// server-side; posting age is filtered here. No runtime dependencies.

import { rootCertificates } from "node:tls"

export const PORTAL_URL = "https://www.buscadordeempleo.gov.co"
export const API_URL = `${PORTAL_URL}/backbue/v1`
export const PAGE_SIZE = 50

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; buscadorempleo-cli/1.0)"

// The server sends its own certificate without the intermediate that signed it
// (checked 2026-10-01). Browsers and curl fetch the missing link themselves;
// bun does not and fails with "unable to verify the first certificate". This is
// that public intermediate, "GeoTrust TLS RSA CA G1", issued by DigiCert Global
// Root G2 and downloaded from https://cacerts.digicert.com/GeoTrustTLSRSACAG1.crt.pem
// (SHA-256 C0:6E:30:7F:...:6C:8A:23:0E, expires 2027-11-02). It is added to the
// normal trust store for this CLI's requests only; verification stays on.
const INTERMEDIATE_CA = `-----BEGIN CERTIFICATE-----
MIIEjTCCA3WgAwIBAgIQDQd4KhM/xvmlcpbhMf/ReTANBgkqhkiG9w0BAQsFADBh
MQswCQYDVQQGEwJVUzEVMBMGA1UEChMMRGlnaUNlcnQgSW5jMRkwFwYDVQQLExB3
d3cuZGlnaWNlcnQuY29tMSAwHgYDVQQDExdEaWdpQ2VydCBHbG9iYWwgUm9vdCBH
MjAeFw0xNzExMDIxMjIzMzdaFw0yNzExMDIxMjIzMzdaMGAxCzAJBgNVBAYTAlVT
MRUwEwYDVQQKEwxEaWdpQ2VydCBJbmMxGTAXBgNVBAsTEHd3dy5kaWdpY2VydC5j
b20xHzAdBgNVBAMTFkdlb1RydXN0IFRMUyBSU0EgQ0EgRzEwggEiMA0GCSqGSIb3
DQEBAQUAA4IBDwAwggEKAoIBAQC+F+jsvikKy/65LWEx/TMkCDIuWegh1Ngwvm4Q
yISgP7oU5d79eoySG3vOhC3w/3jEMuipoH1fBtp7m0tTpsYbAhch4XA7rfuD6whU
gajeErLVxoiWMPkC/DnUvbgi74BJmdBiuGHQSd7LwsuXpTEGG9fYXcbTVN5SATYq
DfbexbYxTMwVJWoVb6lrBEgM3gBBqiiAiy800xu1Nq07JdCIQkBsNpFtZbIZhsDS
fzlGWP4wEmBQ3O67c+ZXkFr2DcrXBEtHam80Gp2SNhou2U5U7UesDL/xgLK6/0d7
6TnEVMSUVJkZ8VeZr+IUIlvoLrtjLbqugb0T3OYXW+CQU0kBAgMBAAGjggFAMIIB
PDAdBgNVHQ4EFgQUlE/UXYvkpOKmgP792PkA76O+AlcwHwYDVR0jBBgwFoAUTiJU
IBiV5uNu5g/6+rkS7QYXjzkwDgYDVR0PAQH/BAQDAgGGMB0GA1UdJQQWMBQGCCsG
AQUFBwMBBggrBgEFBQcDAjASBgNVHRMBAf8ECDAGAQH/AgEAMDQGCCsGAQUFBwEB
BCgwJjAkBggrBgEFBQcwAYYYaHR0cDovL29jc3AuZGlnaWNlcnQuY29tMEIGA1Ud
HwQ7MDkwN6A1oDOGMWh0dHA6Ly9jcmwzLmRpZ2ljZXJ0LmNvbS9EaWdpQ2VydEds
b2JhbFJvb3RHMi5jcmwwPQYDVR0gBDYwNDAyBgRVHSAAMCowKAYIKwYBBQUHAgEW
HGh0dHBzOi8vd3d3LmRpZ2ljZXJ0LmNvbS9DUFMwDQYJKoZIhvcNAQELBQADggEB
AIIcBDqC6cWpyGUSXAjjAcYwsK4iiGF7KweG97i1RJz1kwZhRoo6orU1JtBYnjzB
c4+/sXmnHJk3mlPyL1xuIAt9sMeC7+vreRIF5wFBC0MCN5sbHwhNN1JzKbifNeP5
ozpZdQFmkCo+neBiKR6HqIA+LMTMCMMuv2khGGuPHmtDze4GmEGZtYLyF8EQpa5Y
jPuV6k2Cr/N3XxFpT3hRpt/3usU/Zb9wfKPtWpoznZ4/44c1p9rzFcZYrWkj3A+7
TNBJE0GmP2fhXhP1D/XVfIW/h0yCJGEiV9Glm/uGOa3DXHlmbAcxSyCRraG+ZBkA
7h4SeM6Y8l/7MBRpPCz6l8Y=
-----END CERTIFICATE-----
`
const TRUSTED_CA = [...rootCertificates, INTERMEDIATE_CA]

/** Fetch JSON with exponential backoff on 429/5xx. Returns null on a 404. */
export async function jsonFetch(url: string): Promise<unknown> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Accept-Language": "es-CO,es;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(45000),
      tls: { ca: TRUSTED_CA },
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

export interface Provider {
  name: string | null
  url: string | null
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  deadline: string | null
  salary: string | null
  contractType: string | null
  educationLevel: string | null
  remote: boolean | null
  experienceMonths: number | null
  openings: number | null
  description: string | null
  providers: Provider[]
  url: string
}

export interface Place {
  name: string
  total: number
}

export interface SearchPage {
  cards: JobCard[]
  total: number
  totalPages: number
  municipalities: Place[]
  departments: Place[]
}

/** Lowercase and strip accents, for accent-insensitive matching. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

/** Local calendar date as YYYY-MM-DD. toISOString() is UTC, which reads as "tomorrow" on a Colombian evening. */
export function localISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Windows-1252 characters above U+00FF, mapped back to their byte.
const CP1252: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89,
  "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95,
  "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
}

/**
 * Some providers upload UTF-8 text that was read as Windows-1252 ("Â¡", "â€“").
 * Re-decode it when, and only when, the whole string round-trips cleanly.
 */
export function repairMojibake(text: string): string {
  if (!/[ÂÃâ]/.test(text)) return text
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    const byte = code <= 0xff ? code : CP1252[text[i]]
    if (byte === undefined) return text
    bytes[i] = byte
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return text
  }
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = repairMojibake(v).replace(/\s+/g, " ").trim()
  return t || null
}

function int(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

function isoDay(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null
}

function httpUrl(v: unknown): string | null {
  return typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim()) ? v.trim() : null
}

/** One API record -> JobCard. Returns null when the record has no code or title. */
export function toCard(raw: unknown): JobCard | null {
  if (typeof raw !== "object" || raw === null) return null
  const r = raw as Record<string, unknown>
  const id = typeof r.CODIGO_VACANTE === "string" || typeof r.CODIGO_VACANTE === "number" ? String(r.CODIGO_VACANTE).trim() : ""
  const title = str(r.TITULO_VACANTE)
  if (!id || !title) return null

  const providers: Provider[] = Array.isArray(r.DETALLES_PRESTADOR)
    ? r.DETALLES_PRESTADOR.filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null).map((p) => ({
        name: str(p.NOMBRE_PRESTADOR),
        url: httpUrl(p.URL_DETALLE_VACANTE),
      }))
    : []
  const municipio = str(r.MUNICIPIO)
  const departamento = str(r.DEPARTAMENTO)
  const location = [municipio, departamento !== municipio ? departamento : null].filter(Boolean).join(", ")

  return {
    id,
    title,
    company: providers.find((p) => p.name)?.name ?? null,
    location: location || null,
    date: isoDay(r.FECHA_PUBLICACION),
    deadline: isoDay(r.FECHA_VENCIMIENTO),
    salary: str(r.RANGO_SALARIAL),
    contractType: str(r.TIPO_CONTRATO),
    educationLevel: str(r.NIVEL_ESTUDIOS),
    remote: typeof r.TELETRABAJO === "number" ? r.TELETRABAJO !== 0 : null,
    experienceMonths: int(r.MESES_EXPERIENCIA_CARGO),
    openings: int(r.CANTIDAD_VACANTES),
    description: str(r.DESCRIPCION_VACANTE),
    providers,
    // The portal is a single-page app with no per-vacancy address; the
    // vacancy's own page lives on the provider that published it.
    url: providers.find((p) => p.url)?.url ?? `${PORTAL_URL}/#/home`,
  }
}

function places(raw: unknown, key: string): Place[] {
  if (!Array.isArray(raw)) return []
  const out: Place[] = []
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue
    const name = (item as Record<string, unknown>)[key]
    const total = (item as Record<string, unknown>).total
    if (typeof name === "string" && name.trim()) out.push({ name, total: typeof total === "number" ? total : 0 })
  }
  return out
}

/** Parse a /vacantes/resultados response. Records are converted one by one, so a malformed one cannot break the rest. */
export function parseSearchPage(raw: unknown): SearchPage {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>
  const cards: JobCard[] = []
  for (const item of Array.isArray(r.resultados) ? r.resultados : []) {
    const card = toCard(item)
    if (card) cards.push(card)
  }
  return {
    cards,
    total: int(r.total_registros) ?? cards.length,
    totalPages: int(r.totalPages) ?? 0,
    municipalities: places(r.total_municipios, "municipio"),
    departments: places(r.total_departments, "department"),
  }
}

export interface LocationFilter {
  param: "MUNICIPIO" | "DEPARTAMENTO"
  value: string
}

function norm(text: string): string {
  return fold(text).replace(/[.,]/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * Map free text ("bogota", "Antioquia") to the exact value the API expects
 * ("BOGOTÁ, D.C.", "ANTIOQUIA"). The API matches these literally, accents and
 * all, so the value is picked from the lists the API itself returns. An exact
 * name wins over a prefix; a municipality wins over a department; ties go to
 * the place with more vacancies.
 */
export function resolveLocation(input: string, municipalities: Place[], departments: Place[]): LocationFilter | null {
  const needle = norm(input)
  if (!needle) return null
  const best = (list: Place[], test: (n: string) => boolean): Place | undefined =>
    list.filter((p) => test(norm(p.name))).sort((a, b) => b.total - a.total)[0]
  const exact = (n: string) => n === needle
  const prefix = (n: string) => n.startsWith(needle + " ")

  for (const test of [exact, prefix]) {
    const m = best(municipalities, test)
    if (m) return { param: "MUNICIPIO", value: m.name }
    const d = best(departments, test)
    if (d) return { param: "DEPARTAMENTO", value: d.name }
  }
  return null
}

export function buildSearchUrl(query: string, page: number, location?: LocationFilter | null): string {
  const params = new URLSearchParams({ page: String(page), DESCRIPCION_VACANTE: query })
  if (location) params.set(location.param, location.value)
  return `${API_URL}/vacantes/resultados?${params.toString()}`
}

/** Exact lookup of one vacancy by its code. */
export function buildDetailUrl(id: string): string {
  return `${API_URL}/vacantes/resultados?${new URLSearchParams({ page: "1", CODIGO_VACANTE: id }).toString()}`
}
