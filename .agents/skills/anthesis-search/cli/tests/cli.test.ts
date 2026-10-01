import { describe, expect, test } from "bun:test";
import { runCLI, parseJSON } from "./helpers";
import { filterByLocation, filterByQuery, htmlToText, parsePostings, toCard } from "../src/helpers";
import { findPosting, normalizeId } from "../src/commands/detail";

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
    expect(first.id).toMatch(/^\d{3,}$/);
    expect(first.title).toBeTruthy();
    expect(first.url).toContain("anthesisgroup.pinpointhq.com");
  }, 90000);
});

describe("flag validation", () => {
  test("a bogus flag exits 1 with a JSON error on stderr", async () => {
    const result = await runCLI(["search", "-q", "sostenibilidad", "--bogus", "x"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).code).toBe("UNKNOWN_FLAG");
  });

  test("--query without a value exits 1 with a JSON error on stderr", async () => {
    const result = await runCLI(["search", "--query"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("BAD_ARG");
  });

  test("detail without an id exits 1", async () => {
    const result = await runCLI(["detail"]);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).code).toBe("NO_ID");
  });
});

describe("parsing", () => {
  const uuid = "aec57937-5f63-430d-89da-04fcd98e954d";
  const record = {
    id: "554981",
    title: "Consultor/a Senior: Datos ESG y Packaging",
    path: `/es/postings/${uuid}`,
    description: "<div><!--block-->Buscamos a alguien con <strong>pasi&oacute;n</strong>.<br>Segunda l&iacute;nea</div>",
    key_responsibilities_header: "Qué harás",
    key_responsibilities: "<ul><li><!--block-->Analizar datos ESG</li><li>Asesorar clientes</li></ul>",
    skills_knowledge_expertise: "",
    benefits: null,
    compensation_visible: false,
    compensation: "secret",
    deadline_at: "2026-10-15T23:59:59+01:00",
    employment_type_text: "Permanent - Full Time",
    workplace_type_text: "Hybrid",
    job: { requisition_id: "2026-0101", department: { name: "Consulting" } },
    location: { city: "Bogotá D.C", name: "Colombia" },
  };
  const feed = { data: [{ id: "1", title: "sin ruta" }, record, { ...record, id: "2", location: { city: "London", name: "UK - London" } }] };

  test("records map to postings and a malformed record is skipped", () => {
    const postings = parsePostings(feed);
    expect(postings).toHaveLength(2);
    expect(postings[0]).toMatchObject({
      id: "554981",
      company: "Anthesis Group",
      location: "Bogotá D.C, Colombia",
      date: null,
      deadline: "2026-10-15",
      employmentType: "Permanent - Full Time",
      workplaceType: "Hybrid",
      department: "Consulting",
      requisitionId: "2026-0101",
      salary: null,
      url: `https://anthesisgroup.pinpointhq.com/es/postings/${uuid}`,
    });
    expect(postings[0].sections).toEqual([
      { heading: null, text: "Buscamos a alguien con pasión.\nSegunda línea" },
      { heading: "Qué harás", text: "- Analizar datos ESG\n- Asesorar clientes" },
    ]);
    expect(postings[1].location).toBe("UK - London");
    expect(toCard(postings[0])).not.toHaveProperty("sections");
  });

  test("query and location filters are accent-insensitive", () => {
    const postings = parsePostings(feed);
    expect(filterByQuery(postings, "PACKAGING esg")).toHaveLength(2);
    expect(filterByQuery(postings, "pasion")).toHaveLength(2);
    expect(filterByQuery(postings, "packaging blockchain")).toHaveLength(0);
    expect(filterByQuery(postings, undefined)).toHaveLength(2);
    expect(filterByLocation(postings, "bogota")).toHaveLength(1);
    expect(filterByLocation(postings, "Colombia")).toHaveLength(1);
  });

  test("ids and URLs resolve to postings; other hosts are rejected", () => {
    const postings = parsePostings(feed);
    expect(normalizeId("554981")).toEqual({ kind: "id", value: "554981" });
    const fromUrl = normalizeId(`https://anthesisgroup.pinpointhq.com/en/postings/${uuid.toUpperCase()}`);
    expect(fromUrl).toEqual({ kind: "uuid", value: uuid });
    expect(findPosting(postings, fromUrl!)?.id).toBe("554981");
    expect(normalizeId(`https://evil.example/postings/${uuid}`)).toBeNull();
    expect(normalizeId("not-an-id")).toBeNull();
  });

  test("htmlToText keeps paragraph breaks", () => {
    expect(htmlToText("<p>Uno &amp; dos</p><p>Tres</p>")).toBe("Uno & dos\nTres");
  });
});
