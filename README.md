# materiaalgebonden-co2-opslag

An open reference implementation of the Dutch determination method for **material-bound CO₂ storage**
(Construction Stored Carbon) — the arithmetic, the eligibility gates, and a fixture suite anyone can test
their own tool against.

Not affiliated with, endorsed by, or approved by Stichting Climate Cleanup. See `NOTICE`.

```bash
node --test "test/*.test.js"     # no install, no build step, no dependencies
```

## Why this exists

Four Dutch tools report an indicator for material-bound CO₂ storage. **None publishes a conforming method.**
Two demonstrably use a different one (a continuous lifespan multiplier capped at 1, rather than the method's
binary 35-year gate — roughly a factor 2 apart at RSL 40 years). The method's own reference tool is a
spreadsheet whose product table is hand-transcribed and partly expired.

So the gap is not another calculator. It is a checkable one: the same inputs, the same numbers, and a public
set of cases where the method's own prescribed variant behaves in ways the method does not describe.

## What it does

- **Three rule sets, selected explicitly, never defaulted silently:**
  `CSC-2026-01` (v1.0), `CSC-2026-02` (v1.1, current), `ONCRA-BP-1.0` (the protocol named in the 2026
  Nationaal Groenfonds / LVVN tenders). They disagree on real EPDs — see the tests.
- **Formulas 2a, 2b, 3, 4.i–4.v, 5, 6.**
- **Gates that block with a machine-readable reason**, never a column that reports while the number flows into
  the total anyway: `rsl_unknown`, `rsl_lt_35`, `epd_expired`, `epd_not_a2`, `not_a_specific_epd`,
  `no_verified_epd`, `modules_incomplete`, `negative_variant3`, `variant3_sign_implausible`,
  `variant_disagreement`, `fractions_not_summing_to_one`, `not_biobased`.
- **Three totals, never one:** official (Formula 5), indicative, and an excluded register with per-row reasons.

## Findings encoded as tests

Each of these is a real, verified EN15804+A2 EPD. They are the reason the gates exist.

| Case | What happens |
|---|---|
| Steel screws (ÖKOBAUDAT EPD-AWU-20230570-CBA1-EN) | Biogenic uptake of the packaging sits in A1–A3 and is released in A5. The correct A1–A5 sum is ≈ 0. Reading A1–A3 alone — as the reference spreadsheet does — **invents >1,100 kg CO₂e of stored carbon out of 15 tonnes of steel screws**, with a plausible sign. |
| Planed spruce (EPD-IES-0031212:001) | Declares GWP-biogenic A1–A3 = **+2.47** kg CO₂e/m³ with A4/A5 undeclared, while declaring 230 kg C in the product. The mandatory variant is not derivable → block. Assume the missing modules are zero, as a naive tool does, and it returns **negative stored carbon for solid spruce**. |
| Congo-Basin decking (INIES 20230634171) | Variant 4.iii = 62.57 vs 4.ii = 30.43 kg CO₂e/m² — **+105.6%**, from a negative A5 booking the substructure's biogenic uptake. The method states verbatim that this variant is "altijd conservatief". |
| Concrete foundation (INIES 20240839958-FCe) | Variant 4.iii is negative. Formula 5 is a plain sum with no clamping rule, so read literally it **subtracts** from the building total. Here it contributes 0 and is flagged. |
| Thünen wood fibre insulation (ÖKOBAUDAT 34633906) | The EPD books −11.102 in A3 and exactly +11.102 in A5: the packaging cancels itself. Summing A1–A5 reproduces the separately declared biogenic carbon to **0.006%**; reading A1–A3 only — as the ONCRA protocol prescribes — **overstates by 4.69%**. |
| Thünen CLT (ÖKOBAUDAT d8d40f2d) | Positive control. No packaging, so both independent routes agree to **0.002%**. |
| Ecophon Master B Straw (environdec 3aa1f8dc) | Over A1–A5 the mandated variant returns **negative** storage and the row blocks; over A1–A3, as the ONCRA protocol prescribes, it returns **+0.107** and would pass. One product, two protocols, opposite sign. |
| Untreated softwood, three elements (BBSR 331.113 / 335.713 / 534.318) | Same plank: **≥50 years** in a load-bearing wall, **30** as facade cladding, **10** as a fence. The first passes the gate; the other two do not. No EPD can express that, which is why none declares a service life. |
| Poppies, Amsterdam (Oncra RJM-C-001) | Two DERIX MRPI EPDs over the documented 2,369 m³ reproduce the **certified 1,826 t to within 0.1%**. The method works where the data exists. |

## Rebuilding the product data

```bash
node scripts/ingest-soda4lca.mjs                                            # Thünen wood datasets
node scripts/ingest-soda4lca.mjs --node environdec --search "Glulam,Plywood"
```

We ship the recipe, not the meal. ÖKOBAUDAT permits free redistribution of its data *unmodified*
with the source named; a converted, filtered extract is modified, and the terms are silent on
that. So the ingest script is ours (Apache-2.0) and rebuilds the dataset from source in about a
minute. Output lands in `data/`, which is git-ignored — no stale committed copy that quietly
expires.

**Two nodes, opposite gaps, same outcome.** Measured 2026-07-30 on every EN15804+A2 timber and
biobased dataset each node would give us:

| | ÖKOBAUDAT (Thünen, 20) | environdec (174) |
|---|---|---|
| biogenic carbon in kg C — Variant 4.ii | **20/20** | **0/174** |
| packaging carbon declared separately | 20/20 | 0/174 |
| declared unit resolvable from the flow | 20/20 | 0/174 |
| A4 declared | **0/20** | 168/174 |
| A5 declared | 20/20 | 166/174 |
| Variant 4.iii derivable | 20/20 * | 131/174 |
| registration number — required by Tabel 2 | **0/20** | 172/174 |
| service life declared | **0/20** | **0/174** |
| **reaching status `bepaald`** | **0/20** | **0/174** |

\* with a missing A4 treated as not declared — see the interpretation note in `src/rulesets.js`.

Neither node is sufficient on its own, and they fail in opposite directions: ÖKOBAUDAT gives the
physical quantities but no registration number, environdec gives the registration numbers but no
physical quantities. **Neither declares a service life, so across 194 datasets not one product can
reach an official determination.**

Two cross-checks worth having:

- Where both routes exist (ÖKOBAUDAT, 20 products), the separately declared kg C and the A1–A5
  sum agree to a **median 0.002%, max 0.038%**. The arithmetic is sound; the data is not the problem.
- Reading A1–A3 only, as the ONCRA protocol prescribes, disagrees with the declared kg C by a
  **median 0.445%, max 4.690%** — and on 18 of the 131 derivable environdec records the mandated
  A1–A5 sum returns **negative** stored carbon, of which 5 **flip sign** between the two protocols.

## The service-life problem

The method excludes any product with a Reference Service Life under 35 years. Across the 194
datasets above, **zero** declare one — and two manufacturers say outright that they will not:
PAVATEX (EPD-PAV-20250684-IBC1-DE §2.12) states *"wird keine Referenz-Nutzungsdauer deklariert …
Die durchschnittliche Nutzungsdauer liegt in der Größenordnung des Gebäudes."*

They are not being unhelpful. Service life is a property of the **element**, not of the material,
and an EPD describes a product without knowing where it will be installed. `src/service-life.js`
carries a curated element-level reference (BBSR *Nutzungsdauern von Bauteilen*, Stand 13-03-2026 —
the same federal body behind ÖKOBAUDAT), scoped to biobased construction and cited per entry.

It **proposes**; it never decides. A row must name the element reference to use it, and the result
is flagged `rsl_from_reference_table` so a reviewer can see the lifespan was asserted from guidance
rather than declared by the manufacturer. An unknown reference blocks rather than defaulting.

Of the 36 curated elements, 7 fall below the 35-year gate and 3 sit exactly on it.

## What it deliberately does not do

No certification. No MPG/MKI figure — this is not a validated *rekeninstrument* and its output must never be
presented as one. No NCRB/baseline. No IFC parsing. No NMD data: v1.1 removed NMD as a data source, and the
NMD terms forbid licensees from publishing the raw data in any case.

## Status

The calculation core and the conformance suite are done and green: 18 tests, 11 published cases.
The ingest reads ÖKOBAUDAT today. The product data layer is next.

Measured by hand on one real Dutch building (103 dwellings, timber structure, an issued carbon
certification): **18% of biobased rows** reach an official determination from openly available data, while
**~85% of the stored carbon** does. The blocker is not the arithmetic. EPDs almost never declare a service
life — 0 of ~25 records sampled, and two manufacturers state outright that they will not declare one — and
no public record says which product was actually installed.

Live: <https://carbon.resourcepaspoort.app>

## Licence

Code: Apache-2.0. Our own fixtures, schema and provenance metadata: CC BY 4.0.
Third-party EPD records are not redistributed — per-source terms are carried and enforced in code.
