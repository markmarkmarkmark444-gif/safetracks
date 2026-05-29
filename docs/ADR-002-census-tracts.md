# ADR-002: Census Tracts as the Standard Public Geographic Unit

**Status:** Accepted  
**Date:** May 2026  
**Deciders:** Azimuth Foundation Inc. Technical Committee + Public Health Informatics Advisor  
**Applicability:** SafeTracks public-facing API, R Shiny dashboard integration, GeoJSON feed  

---

## Context

SafeTracks collects exact GPS coordinates from field workers to accurately
document sharps locations. These coordinates cannot be published at full
precision because:

1. **Re-identification risk** — A sharps cluster at a specific alley behind a
   specific building could be used to locate and surveil individuals who use
   drugs, violating Section 19.1 (Anti-Surveillance Policy) and HIPAA's
   minimum necessary standard.

2. **OSHA chain-of-custody** — Exact coordinates are operationally necessary
   for routing collection teams, but must be restricted to authorized personnel.

3. **Public health utility** — Aggregate spatial patterns (which neighborhoods,
   which corridors) are epidemiologically actionable. Individual-point precision
   is not necessary for the public health use case and introduces harm.

The system must therefore map exact coordinates to a **public geographic unit**
that:
- Provides meaningful spatial resolution for epidemiological analysis
- Carries a known, consistent population denominator for rate calculation
- Does not allow back-calculation of precise coordinates
- Aligns with data schemas used by partner agencies

We evaluated three candidate units: ZIP codes, census tracts, and census
block groups.

---

## Decision

**Use U.S. Census Bureau TIGER/Line Census Tracts (vintage 2020)** as the
exclusive public geographic unit for all externally-facing data products.

Census tracts are identified by their 11-digit FIPS code:
`{2-digit state}{3-digit county}{6-digit tract}` (e.g., `23003010100` for
Aroostook County, Maine, tract 101.00).

Exact PostGIS coordinates are mapped to census tracts via `ST_Contains`
spatial join at query time. Exact coordinates are never exposed in the public
API layer (G-1 GIS methodology requirement).

---

## Rationale

### 1. Designed for Population Comparability

The Census Bureau designs tracts to contain **2,500–8,000 residents**, with
an optimal target of 4,000. This design principle means that rates computed
across tracts are directly comparable — sharps-per-10,000-residents in
Tract A can be meaningfully compared to the same metric in Tract B.

ZIP codes have no such population design. Maine ZIP codes range from fewer
than 50 residents (remote rural areas) to over 25,000 (Portland metro). A
ZIP code rate of "5 events" means something categorically different depending
on whether the ZIP has 100 or 25,000 residents. This makes ZIP-level
epidemiological comparison statistically invalid.

### 2. Stable Boundaries Enable Longitudinal Analysis

Census tract boundaries update only with each decennial census (next update:
2030). This stability means that a time series of sharps counts from 2026
through 2030 refers to the same geographic unit throughout — essential for
measuring intervention effectiveness over time.

ZIP code boundaries are updated by the USPS on an irregular schedule
(sometimes multiple times per year) when mail routing changes. A single ZIP
code boundary change mid-study would break longitudinal analysis without
a complex boundary-change correction factor.

### 3. Population Denominator Availability (G-1 Methodology)

The American Community Survey (ACS) 5-year estimates provide population counts,
poverty rates, racial/ethnic composition, housing vacancy, and health insurance
coverage at the census tract level. These denominators are required to compute
the normalized rate metric mandated by GIS Methodology G-1:

```
sharps_rate = (event_count / tract_population) × 10,000
```

No equivalent systematic denominator exists at the ZIP code level.
ZIP-level population estimates are approximations (interpolated from block
groups), not primary survey data. ACS tract-level data is primary.

The SafeTracks R Shiny integration with UMaine uses ACS tract-level data
(via the `tidycensus` R package) to join sharps rates with SUD-relevant
social determinants — poverty, uninsurance, housing instability. This join
is only valid if both datasets use the same geographic unit (census tracts).

### 4. Alignment with Partner Data Schemas

All SafeTracks data partner agencies use census tracts as their primary unit:

| Partner | Geographic Unit Used |
|---|---|
| Maine Drug Data Hub | Census tract (FIPS 11-digit) |
| SAMHSA NEDEWS | Census tract |
| CDC WONDER (drug overdose data) | County → census tract |
| USDS / HHS Opioid Crisis Data Platform | Census tract |
| Maine CDC Vital Statistics | Census tract (for SVI overlay) |
| UMaine R Shiny Dashboards | Census tract |

Publishing at ZIP code would require all partners to perform a crosswalk
(census tract → ZIP approximation) before joining with their datasets.
This introduces error. Publishing at census tract eliminates the crosswalk
entirely — the SafeTracks GeoJSON can be loaded directly into any partner
system.

### 5. Privacy Floor — De-identification Under Safe Harbor

HHS's Safe Harbor de-identification method (45 CFR §164.514(b)) specifies
that geographic units with populations ≥ 20,000 are generally safe for
public reporting. Census tracts target 4,000 residents; rural Maine tracts
average ~2,800 residents.

For tracts below the Safe Harbor threshold, the small-cell suppression rule
(G-2 methodology) applies: event counts of 1–4 are published as "suppressed"
rather than the actual count. This prevents back-calculation of individual
events even in sparsely populated rural tracts.

ZIP codes in rural Maine can contain fewer than 100 residents. At that scale,
a count of "1 event" is nearly equivalent to publishing the exact address.
Census tracts provide a privacy floor that ZIP codes cannot.

### 6. Federal Shutdown Resilience (Section 20.3)

The system bundles a static SQLite geodatabase of all Maine census tract
polygons (2020 TIGER/Line, ~2MB) to resolve coordinates offline. This
eliminates dependency on the Census Geocoder API (which has experienced
outages during federal government shutdowns).

ZIP code boundary files are less consistently maintained in static form,
and commercial ZIP code databases often have licensing restrictions
incompatible with open-source public health tools.

---

## Alternatives Considered and Rejected

### ZIP Codes (ZCTA — ZIP Code Tabulation Areas)
**Rejected.** No consistent population denominator. Boundaries change
unpredictably. Cannot align with partner data schemas. Inadequate privacy
floor in rural Maine. Statistical invalidity for rate comparison.

The only argument for ZIP codes is familiarity to the public. We address
this in the dashboard layer by displaying the town/city name alongside
the census tract code.

### Census Block Groups
**Rejected at the public API layer.** Block groups (300–3,000 residents)
provide higher spatial resolution than tracts but fall below the HHS
Safe Harbor threshold in many rural Maine areas. The small-cell suppression
rule would suppress a disproportionate fraction of rural data, creating a
reporting gap precisely where SafeTracks is most needed (rural Aroostook,
Washington, Piscataquis counties).

Block groups remain available as an **internal-only** layer: field workers
and authorized staff see block group resolution; the public API returns
only census tract aggregates.

### County Level
**Rejected as insufficiently granular.** Maine has 16 counties. County-level
data cannot distinguish between the downtown Portland core and its suburbs,
or between Bangor's high-density zones and surrounding rural townships.
County-level resolution is insufficient for targeted harm reduction response.

---

## Implementation Notes

**Spatial join (Supabase/PostGIS):**
```sql
-- Map exact coordinates to census tract at query time
SELECT
  ct.geoid                                     AS census_tract,
  ct.name                                       AS tract_name,
  COUNT(se.id)                                  AS event_count,
  COUNT(se.id) * 10000.0 / ct.total_population  AS rate_per_10k
FROM sharps_events se
JOIN maine_census_tracts ct
  ON ST_Contains(ct.geom, ST_SetSRID(ST_MakePoint(se.lon, se.lat), 4326))
WHERE se.hcs_status = 'CONFIRMED'
  AND se.collected_at >= $1
GROUP BY ct.geoid, ct.name, ct.total_population
HAVING COUNT(se.id) >= 5  -- Small-cell suppression (G-2)
ORDER BY rate_per_10k DESC;
```

**Suppression rule in GeoJSON API:**
```javascript
properties.event_count = count < 5 ? 'suppressed' : count;
properties.rate_per_10k = count < 5 ? null : rate;
```

**Static geodatabase bundling (Section 20.3 fallback):**
The file `backend/geodata/maine_tracts_2020.sqlite` contains all Maine
census tract polygons (EPSG:4326) for offline coordinate resolution.
Primary resolution uses Supabase PostGIS; this file activates only when
the Supabase connection is unavailable.

---

## Consequences

**Positive:**
- Direct schema compatibility with all partner agencies — no crosswalk required
- Valid population denominators for rate normalization (G-1)
- Stable boundaries for longitudinal analysis
- HHS Safe Harbor de-identification compliance with small-cell suppression
- Federal-shutdown-resilient via bundled SQLite geodatabase

**Negative / Accepted Tradeoffs:**
- Census tracts are unfamiliar to lay audiences; mitigated by showing town names in UI
- 2020 tract boundaries will diverge from reality as population shifts; accept until 2030 Census
- Block-group resolution not available in public API; internal-only access for staff

---

## Compliance References

- HHS Safe Harbor de-identification: 45 CFR §164.514(b)
- GIS Methodology G-1: Population normalization (sharps per 10k residents)
- GIS Methodology G-2: Minimum cell suppression (counts < 5 → "suppressed")
- GIS Methodology G-5: PostGIS geography types, EPSG:4326
- Section 19.1: Anti-surveillance policy — exact coordinates never in public layer
- Section 20.3: Federal data dependency mitigation — bundled SQLite geodatabase
