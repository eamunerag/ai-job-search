import { describe, expect, test } from "bun:test";
import { runCLI, parseJSON } from "./helpers";
import {
  buildSearchUrl,
  dmyToISO,
  parseDetail,
  parseJobTiles,
  parseLocationFacets,
  parseTotal,
  resolveLocation,
  searchPath,
} from "../src/helpers";
import { normalizeId } from "../src/commands/detail";

interface SearchOutput {
  meta: { count: number; page: number; total: number };
  results: Array<{ id: string | null; title: string | null; url: string | null }>;
}

describe("live smoke test", () => {
  test("search returns at least one complete result", async () => {
    const result = await runCLI(["search", "-q", "gerente", "--limit", "5"]);
    const out = parseJSON<SearchOutput>(result);
    expect(out.results.length).toBeGreaterThanOrEqual(1);
    const first = out.results[0];
    expect(first.id).toMatch(/^JN-\d{6}-\d+$/);
    expect(first.title).toBeTruthy();
    expect(first.url).toContain("michaelpage.com.co/job-detail/");
  }, 90000);
});

describe("flag validation", () => {
  test("a bogus flag exits 1 with a JSON error on stderr", async () => {
    const result = await runCLI(["search", "-q", "gerente", "--bogus", "x"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).code).toBe("UNKNOWN_FLAG");
  });

  test("a missing --query exits 1 with a JSON error on stderr", async () => {
    const result = await runCLI(["search"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("NO_QUERY");
  });

  test("detail without an id exits 1", async () => {
    const result = await runCLI(["detail"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("NO_ID");
  });
});

describe("parsing", () => {
  const path = "/job-detail/consultora-de-gesti%C3%B3n/ref/jn-092026-7098494";
  const tile = (p: string, cls: string, title: string) => `<li class="views-row"><div about="${p}" class="${cls}">
    <div class="job-title " id="1840911"><h3><a href="${p}" rel="bookmark" id="job-1840911" >${title}</a></h3></div>
    <div class="job-properties"><div class="job-location"><i class="fal" aria-hidden="true"></i> Bogot&aacute;</div>
    <div class="job-contract-type"><i class="far"></i> Permanente</div>
    <div class="job-salary"><i class="fal"></i> COP5,000,000 - COP5,400,000 por mes</div></div>
    <div class="job-summary"><div class="job_advert__job-summary-text"><p>Resumen &amp; m&aacute;s.</p></div></div>
    <div class="job-links"><div class="views-field-link-flag flag-add-to-job-basket" about="${p}"> <a>Guardar</a></div></div></div></li>`;
  const list =
    `<span class="total-search no-of-jobs"><span>1</span></span><ul>` +
    `<li class="views-row"><div about="/job-detail/roto/ref/jn-1" class="job-tile search-job-tile"><div>sin título</div></div></li>` +
    tile(path, "job-tile search-job-tile", "Consultor(a) de Gesti&oacute;n") +
    tile("/job-detail/otro/ref/jn-082026-7081745", "job-tile recommended-job-tile search-job-tile", "Recomendado") +
    `</ul>`;

  test("tiles are parsed one by one; broken and recommended tiles are skipped", () => {
    const cards = parseJobTiles(list);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({
      id: "JN-092026-7098494",
      title: "Consultor(a) de Gestión",
      company: null,
      location: "Bogotá",
      date: null,
      salary: "COP5,000,000 - COP5,400,000 por mes",
      contractType: "Permanente",
      summary: "Resumen & más.",
      url: `https://www.michaelpage.com.co${path}`,
    });
    expect(parseTotal(list)).toBe(1);
    expect(parseJobTiles("")).toEqual([]);
  });

  test("location facets resolve free text to the site's own path", () => {
    const facet = (id: number, count: number, url: string, name: string) =>
      `<li class="facet-item" > <span data-drupal-facet-item-id="location-${id}" data-drupal-facet-item-value="${id}" data-drupal-facet-item-count="${count}" data-url="${url}"><span class="facet-item__value">${name}</span> <span class="facet-item__count">${count}</span></span></li>`;
    const facets = parseLocationFacets(
      facet(4131, 24, "/jobs/ingeniero/colombia", "Colombia") +
        facet(4316, 17, "/jobs/ingeniero/bogotá-0", "Bogotá") +
        facet(9, 1, "/jobs/a/b/c/", "Demasiado profundo"),
    );
    expect(facets.map((f) => f.name)).toEqual(["Colombia", "Bogotá"]);
    expect(resolveLocation("bogota", facets)?.path).toBe("/jobs/ingeniero/bogot%C3%A1-0");
    expect(resolveLocation("Narnia", facets)).toBeNull();
  });

  test("a job page is parsed into fields and readable text", () => {
    const html = `<h1 class="job-apply-job-title"><span>Consultor(a) de Gesti&oacute;n </span></h1>
      <div class="job-apply-fields"> <span class="job-location"> <i></i>Cesar </span>
      <span class="job-contract-type"> <i></i>Permanente </span> <span class="job-salary"> <i></i>COP5,000,000 por mes </span></div>
      <div id="job-description"><div id="description" tabindex="0"><p class="job-posted-date"> Fecha de publicación 07/09/2026</p>
      <div class="job-bullet-points"><div class="job_advert__job-desc-bullet-points"><ul><li>Punto uno.</li></ul></div></div>
      <div class="about-you"><h2 class="field--label accordion-tab-title">Descripción</h2><div class="accordion-tab-content"><div class="job_advert__job-desc-role"><ul><li>Gestionar <strong>procesos</strong>.</li><li>Coordinar auditorías.</li></ul></div></div></div>
      <div class="what-an-offer"><h2 class=" field--label accordion-tab-title">Qué Ofrecemos</h2><div class="accordion-tab-content"><div class="job_advert__job-desc-deal"><p>Beneficios.</p></div></div></div>
      <dl><dt class="field--label summary-detail-field-label">Sector</dt><dd class="field--item summary-detail-field-value"><a href="/jobs/x">Energy &amp; Natural Resources</a></dd></dl>
      <dl><dt class="field--label summary-detail-field-label">Nombre del consultor</dt><dd class="field--item summary-detail-field-value" tabindex="0">Andrea Peña</dd></dl>`;
    const job = parseDetail(html, `https://www.michaelpage.com.co${path}`);
    expect(job).toMatchObject({
      id: "JN-092026-7098494",
      title: "Consultor(a) de Gestión",
      location: "Cesar",
      date: "2026-09-07",
      salary: "COP5,000,000 por mes",
      contractType: "Permanente",
      sector: "Energy & Natural Resources",
      consultant: "Andrea Peña",
      applyUrl: "https://www.michaelpage.com.co/job-apply/consultora-de-gesti%C3%B3n/ref/jn-092026-7098494",
      description:
        "- Punto uno.\n\nDescripción:\n- Gestionar procesos.\n- Coordinar auditorías.\n\nQué Ofrecemos:\nBeneficios.",
    });
    expect(parseDetail("<html>404</html>", `https://www.michaelpage.com.co${path}`)).toBeNull();
  });

  test("helpers", () => {
    expect(searchPath("economía circular")).toBe("/jobs/econom%C3%ADa%20circular");
    expect(buildSearchUrl("/jobs/gerente", 1)).toBe("https://www.michaelpage.com.co/jobs/gerente");
    expect(buildSearchUrl("/jobs/gerente", 3, true)).toBe(
      "https://www.michaelpage.com.co/jobs/gerente?sort_by=most_recent&page=2",
    );
    expect(dmyToISO("Fecha de publicación 07/09/2026")).toBe("2026-09-07");
    expect(normalizeId("jn-092026-7098494")).toEqual({ kind: "ref", value: "JN-092026-7098494" });
    expect(normalizeId(`https://www.michaelpage.com.co${path}`)).toEqual({
      kind: "url",
      value: `https://www.michaelpage.com.co${path}`,
    });
    expect(normalizeId(`https://evil.example${path}`)).toBeNull();
    expect(normalizeId("https://www.michaelpage.com.co/jobs/gerente")).toBeNull();
  });
});
