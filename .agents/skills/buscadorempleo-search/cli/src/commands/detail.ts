import { buildDetailUrl, jsonFetch, parseSearchPage, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/**
 * Accept a vacancy code ("código de la oferta"). The portal is a single-page
 * app with no per-vacancy address, so there is no portal URL to parse; a URL
 * (which would belong to some other site) is rejected.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  return /^\d{4,}$/.test(trimmed) ? trimmed : null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(
      `"${opts.id}" is not a vacancy code - pass the numeric id from search results (the portal has no per-vacancy URL)`,
      "BAD_ID",
    )
    return 1
  }
  try {
    // There is no single-vacancy endpoint; the results endpoint filters by exact code.
    const page = parseSearchPage(await jsonFetch(buildDetailUrl(id)))
    const job = page.cards.find((c) => c.id === id)
    if (!job) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }

    if (opts.format === "plain") {
      const facts: Array<[string, string | number | null]> = [
        ["Salario", job.salary],
        ["Tipo de contrato", job.contractType],
        ["Nivel de estudios", job.educationLevel],
        ["Experiencia (meses)", job.experienceMonths],
        ["Vacantes", job.openings],
        ["Teletrabajo", job.remote === null ? null : job.remote ? "Sí" : "No"],
        ["Publicada", job.date],
        ["Vence", job.deadline],
      ]
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"} · código ${job.id}`,
        "",
        job.description || "(sin descripción)",
        "",
        ...facts.filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`),
        "",
        ...job.providers.map((p) => `Prestador: ${p.name || "—"}${p.url ? ` · ${p.url}` : ""}`),
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
