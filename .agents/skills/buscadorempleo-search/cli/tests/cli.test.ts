import { describe, expect, test } from "bun:test";
import { runCLI, parseJSON } from "./helpers";
import { buildSearchUrl, parseSearchPage, repairMojibake, resolveLocation, type JobCard } from "../src/helpers";
import { normalizeId } from "../src/commands/detail";
import { filterByAge } from "../src/commands/search";

interface SearchOutput {
  meta: { count: number; page: number; total: number };
  results: Array<{ id: string | null; title: string | null; url: string | null }>;
}

describe("live smoke test", () => {
  test("search returns at least one complete result", async () => {
    const result = await runCLI(["search", "-q", "sostenibilidad", "--limit", "5"]);
    const out = parseJSON<SearchOutput>(result);
    expect(out.results.length).toBeGreaterThanOrEqual(1);
    const first = out.results[0];
    expect(first.id).toMatch(/^\d{4,}$/);
    expect(first.title).toBeTruthy();
    expect(first.url).toMatch(/^https?:\/\//);
  }, 90000);
});

describe("flag validation", () => {
  test("a bogus flag exits 1 with a JSON error on stderr", async () => {
    const result = await runCLI(["search", "-q", "sostenibilidad", "--bogus", "x"]);
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
  const record = {
    CODIGO_VACANTE: "1081300",
    TITULO_VACANTE: "Analista de Sostenibilidad ",
    DESCRIPCION_VACANTE: "Â¡Tu talento! Gestion ambiental â€“ reportes",
    NIVEL_ESTUDIOS: "Universitarios",
    RANGO_SALARIAL: "$4.000.001 - $6.000.000",
    DEPARTAMENTO: "BOGOTÁ, D.C.",
    MUNICIPIO: "BOGOTÁ, D.C.",
    TIPO_CONTRATO: "Término indefinido",
    CANTIDAD_VACANTES: 1,
    FECHA_VENCIMIENTO: "2026-10-28T00:00:00.000Z",
    TELETRABAJO: 0,
    MESES_EXPERIENCIA_CARGO: 24,
    FECHA_PUBLICACION: "2026-09-26T00:00:00.000Z",
    DETALLES_PRESTADOR: [{ NOMBRE_PRESTADOR: "ACME SAS", URL_DETALLE_VACANTE: "https://example.com/oferta-1081300" }],
  };

  test("records map to cards and a malformed record is skipped", () => {
    const page = parseSearchPage({
      resultados: [{ TITULO_VACANTE: "sin código" }, record],
      totalPages: 3,
      total_registros: 120,
      total_municipios: [{ municipio: "BOGOTÁ, D.C.", total: 80 }],
      total_departments: [{ department: "ANTIOQUIA", total: 20 }],
    });
    expect(page.cards).toHaveLength(1);
    expect(page.total).toBe(120);
    expect(page.cards[0]).toMatchObject({
      id: "1081300",
      title: "Analista de Sostenibilidad",
      company: "ACME SAS",
      location: "BOGOTÁ, D.C.",
      date: "2026-09-26",
      deadline: "2026-10-28",
      salary: "$4.000.001 - $6.000.000",
      remote: false,
      experienceMonths: 24,
      openings: 1,
      description: "¡Tu talento! Gestion ambiental – reportes",
      url: "https://example.com/oferta-1081300",
    });
  });

  test("a vacancy with no provider link falls back to the portal", () => {
    const page = parseSearchPage({ resultados: [{ ...record, DETALLES_PRESTADOR: [] }] });
    expect(page.cards[0].company).toBeNull();
    expect(page.cards[0].url).toContain("buscadordeempleo.gov.co");
  });

  test("mojibake repair leaves correct text alone", () => {
    expect(repairMojibake("Â¿Qué?")).toBe("Â¿Qué?");
    expect(repairMojibake("GestiÃ³n")).toBe("Gestión");
    expect(repairMojibake("Bogotá")).toBe("Bogotá");
  });

  test("locations resolve to the API's exact names", () => {
    const munis = [
      { name: "BOGOTÁ, D.C.", total: 80 },
      { name: "MEDELLÍN", total: 30 },
      { name: "SANTANDER DE QUILICHAO", total: 2 },
    ];
    const depts = [
      { name: "ANTIOQUIA", total: 40 },
      { name: "SANTANDER", total: 9 },
    ];
    expect(resolveLocation("bogota", munis, depts)).toEqual({ param: "MUNICIPIO", value: "BOGOTÁ, D.C." });
    expect(resolveLocation("Medellín", munis, depts)).toEqual({ param: "MUNICIPIO", value: "MEDELLÍN" });
    expect(resolveLocation("antioquia", munis, depts)).toEqual({ param: "DEPARTAMENTO", value: "ANTIOQUIA" });
    expect(resolveLocation("Santander", munis, depts)).toEqual({ param: "DEPARTAMENTO", value: "SANTANDER" });
    expect(resolveLocation("Narnia", munis, depts)).toBeNull();
  });

  test("age filter keeps undated cards", () => {
    const card = (date: string | null) => ({ date }) as JobCard;
    const cards = [card("2026-09-29"), card("2026-06-01"), card(null)];
    expect(filterByAge(cards, 7, new Date("2026-09-30T12:00:00Z"))).toHaveLength(2);
  });

  test("helpers", () => {
    const url = buildSearchUrl("economia circular", 2, { param: "MUNICIPIO", value: "BOGOTÁ, D.C." });
    expect(url).toContain("page=2");
    expect(url).toContain("DESCRIPCION_VACANTE=economia+circular");
    expect(url).toContain("MUNICIPIO=BOGOT%C3%81%2C+D.C.");
    expect(normalizeId("1081300")).toBe("1081300");
    expect(normalizeId("https://example.com/oferta-1081300")).toBeNull();
  });
});
