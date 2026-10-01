# Buscador de Empleo (Servicio Público de Empleo) URL Reference

Public, unauthenticated endpoints used by this skill. Investigated 2026-10-01.

> Personal use only: keep volume low. This is a free public service.

## Access rules

`https://buscadordeempleo.gov.co/robots.txt` and `https://www.buscadordeempleo.gov.co/robots.txt`
both return **HTTP 404**: the site publishes no crawling policy. The portal's terms of use
were not reviewed for automated access. The endpoints below need no login and answer the
honest `Mozilla/5.0 (compatible; buscadorempleo-cli/1.0)` user agent with HTTP 200.

The portal (`https://buscadordeempleo.gov.co/#/home`) is a React single-page app. Its
bundle (`/assets/index-*.js`) calls the API at `https://www.buscadordeempleo.gov.co/backbue/v1`;
the routes below were read from that bundle and confirmed live.

## TLS quirk

The server sends its leaf certificate without the intermediate that signed it
("GeoTrust TLS RSA CA G1", issued by DigiCert Global Root G2). Browsers and curl on Windows
fetch the missing certificate themselves; `bun` and `openssl` do not and fail with
`unable to verify the first certificate`.

`cli/src/helpers.ts` embeds that public intermediate (from
`https://cacerts.digicert.com/GeoTrustTLSRSACAG1.crt.pem`, expires 2027-11-02) and adds it
to the default trust store for this CLI's requests. Verification is never disabled. If the
portal renews under a different intermediate, requests fail with a certificate error again:
run `openssl s_client -connect www.buscadordeempleo.gov.co:443 -showcerts`, read the new
issuer name, download that intermediate from the CA and replace the embedded PEM. If the
portal fixes its chain, the embedded certificate becomes unnecessary but harmless.

## Search

```
GET https://www.buscadordeempleo.gov.co/backbue/v1/vacantes/resultados?page=<n>&DESCRIPCION_VACANTE=<query>
```

| Param | Meaning | Example |
|-------|---------|---------|
| `page` | 1-indexed page, 50 results each | `1` |
| `DESCRIPCION_VACANTE` | Keyword filter, the one the portal's search box sends. Matched against the vacancy text, accent-free. | `sostenibilidad`, `economia circular` |
| `MUNICIPIO` | Exact municipality name, upper case with accents | `BOGOTÁ, D.C.`, `MEDELLÍN` |
| `DEPARTAMENTO` | Exact department name | `ANTIOQUIA` |
| `CODIGO_VACANTE` | Exact vacancy code (used by `detail`) | `1081300` |
| `TELETRABAJO`, `TIPO_CONTRATO`, `RANGO_SALARIAL`, `NIVEL_ESTUDIOS`, `NOMBRE_PRESTADOR`, `MESES_EXPERIENCIA_CARGO`, `HIDROCARBUROS`, `PLAZA_PRACTICA` | Other portal filters, exact values. Not exposed by the CLI. | `TELETRABAJO=1` |

`MUNICIPIO=BOGOTA` (no accent, no ", D.C.") returns zero results: place names are matched
literally. The CLI therefore resolves `--location` against the `total_municipios` and
`total_departments` lists of an unfiltered response for the same query.

Results come newest first (`FECHA_PUBLICACION` descending). There is no date parameter.

Response:

| Path | Meaning |
|------|---------|
| `resultados[]` | Vacancies (see below) |
| `total_registros` | Match count |
| `totalPages`, `currentPage` | Paging |
| `total_municipios[]` | `{ municipio, total }` for the current query |
| `total_departments[]` | `{ department, total }` for the current query |

Each `resultados[]` record:

| Field | Maps to |
|-------|---------|
| `CODIGO_VACANTE` | `id` |
| `TITULO_VACANTE` | `title` |
| `DETALLES_PRESTADOR[].NOMBRE_PRESTADOR` | `company` (first), `providers[].name` |
| `DETALLES_PRESTADOR[].URL_DETALLE_VACANTE` | `url` (first), `providers[].url` |
| `MUNICIPIO`, `DEPARTAMENTO` | `location` |
| `FECHA_PUBLICACION`, `FECHA_VENCIMIENTO` | `date`, `deadline` (ISO timestamps, cut to the day) |
| `RANGO_SALARIAL`, `TIPO_CONTRATO`, `NIVEL_ESTUDIOS` | `salary`, `contractType`, `educationLevel` |
| `TELETRABAJO` (0/1) | `remote` |
| `MESES_EXPERIENCIA_CARGO`, `CANTIDAD_VACANTES` | `experienceMonths`, `openings` |
| `DESCRIPCION_VACANTE` | `description` (about 1,000 characters, no line breaks) |

`CARGO` and `SECTOR_ECONOMICO` are sometimes text and sometimes numeric codes; the CLI
does not expose them. `BUSQUEDA` is the accent-free search index text.

## Detail

There is no single-vacancy endpoint and no per-vacancy portal URL (the app routes by
`#/home`). `detail` calls the search endpoint with `CODIGO_VACANTE=<id>` and returns the
matching record. The full posting lives on the provider's page (`URL_DETALLE_VACANTE`).

## Other routes (not used)

- `GET /filters`: allowed values for `rangoSalarial`, `prestador`, `tipoContrato`, `nivelDeEstudios`.
- `GET /vacantes/date`: `{ max_date }`, the newest publication date in the index.
- `GET /version`: API version.

## Quirks

- Some providers upload UTF-8 text mis-decoded as Windows-1252 ("Â¡", "â€“"); `repairMojibake` re-decodes a string only when the whole of it round-trips cleanly.
- Descriptions arrive with line breaks already removed, so words run together at former line ends.
- The provider URL carries tracking parameters (`utm_*`); they are passed through unchanged.
