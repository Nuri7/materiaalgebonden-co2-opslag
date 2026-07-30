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
| Poppies, Amsterdam (Oncra RJM-C-001) | Two DERIX MRPI EPDs over the documented 2,369 m³ reproduce the **certified 1,826 t to within 0.1%**. The method works where the data exists. |

## Rebuilding the product data

```bash
node scripts/ingest-okobaudat.mjs            # Thünen wood datasets
node scripts/ingest-okobaudat.mjs --owner X  # any owner
```

We ship the recipe, not the meal. ÖKOBAUDAT permits free redistribution of its data *unmodified*
with the source named; a converted, filtered extract is modified, and the terms are silent on
that. So the ingest script is ours (Apache-2.0) and rebuilds the dataset from source in about a
minute. Output lands in `data/`, which is git-ignored — no stale committed copy that quietly
expires.

**What the German national wood dataset actually contains** (20 products, EN15804+A2, measured
2026-07-30):

| | |
|---|---|
| biogenic carbon in kg C — Variant 4.ii usable | **20/20** |
| packaging carbon declared separately | **20/20** |
| A5 declared | 20/20 |
| **A4 declared** | **0/20** |
| registration number — required by Tabel 2 | **0/20** |
| reaching status `bepaald` | **0/20** |

So on Germany's reference data for timber construction, the variant the method *mandates* for
calculation software is the one that cannot be derived, while the variant it ranks *higher* is
available for every single product. And because these are representative datasets without a
registration number, none of them can reach an official determination at all.

Declared kg C versus −(A1–A3) across the 20: median 0.445%, max 4.690%.

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
