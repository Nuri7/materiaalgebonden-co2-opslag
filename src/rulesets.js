/**
 * Versioned rule sets.
 *
 * Every stored result MUST pin the ruleset id it was computed with, so a number
 * stays reproducible after the method changes. Rules live here as DATA, never as
 * constants scattered through the calculation code.
 *
 * Sources (read directly, not paraphrased from secondary material):
 *  - CSC-2026-01 = "Bepalingsmethode materiaalgebonden CO2-opslag", versie 1.0, 26-01-2026,
 *    Stichting Climate Cleanup.
 *  - CSC-2026-02 = idem, versie 1.1, 06-07-2026. Supersedes v1.0.
 *  - ONCRA-BP-1.0 = "Climate Cleanup Certification Protocol Biobased Construction/Products" v1.0,
 *    2024, adopted. This is the protocol named in the 2026 Nationaal Groenfonds / LVVN tenders,
 *    so it is a first-class target, not a footnote.
 *
 * @typedef {'CSC-2026-01'|'CSC-2026-02'|'ONCRA-BP-1.0'} RulesetId
 */

/** kg CO2 per kg C. Molar mass ratio, identical in every ruleset. */
export const CO2_PER_C = 44 / 12

/**
 * Literature carbon fractions cf (kg C per kg dry matter), as published in Table 1 of the
 * Bepalingsmethode. Primary source: Van den Oever et al. (2024), WFBR Report 2545,
 * DOI 10.18174/647711, Table 6.
 *
 * These are measured physical quantities, carried with per-value attribution so any single
 * value can be replaced or withdrawn without touching the rest.
 */
export const CARBON_FRACTIONS = {
  cellulose: { cf: 0.444, source: 'WFBR-2545 T6 via CSC Tabel 1' },
  vlasvezel: { cf: 0.452, source: 'WFBR-2545 T6 via CSC Tabel 1' },
  hennepvezel: { cf: 0.443, source: 'WFBR-2545 T6 via CSC Tabel 1' },
  vlasscheven: { cf: 0.489, source: 'WFBR-2545 T6 via CSC Tabel 1' },
  hennepscheven: { cf: 0.488, source: 'WFBR-2545 T6 via CSC Tabel 1' },
  tarwestro: { cf: 0.467, source: 'WFBR-2545 T6 via CSC Tabel 1' },
  riet: { cf: 0.48, source: 'WFBR-2545 T6 via CSC Tabel 1' },
  schapenwol: { cf: 0.505, source: 'WFBR-2545 T6 via CSC Tabel 1' },
  kurk: { cf: 0.598, source: 'WFBR-2545 T6 via CSC Tabel 1' },
  bamboe: { cf: 0.492, source: 'WFBR-2545 T6 via CSC Tabel 1' },
  populierenhout: { cf: 0.499, source: 'WFBR-2545 T6 via CSC Tabel 1' },
  vurenhout: { cf: 0.498, source: 'WFBR-2545 T6 via CSC Tabel 1' },
  massaranduba: { cf: 0.502, source: 'WFBR-2545 T6 via CSC Tabel 1' },
  zeeschelpen: { cf: 0.12, source: 'WFBR-2545 T6 via CSC Tabel 1' },
  /** EN16449 standard value, permitted for any wood species. */
  hout_en16449: { cf: 0.5, source: 'EN 16449 standaardwaarde' },
  /** Conservative value prescribed by Variant 4.iv. */
  hout_conservatief: { cf: 0.45, source: 'CSC Variant 4.iv (conservatief)' },
}

/** @type {Record<RulesetId, object>} */
export const RULESETS = {
  'CSC-2026-01': {
    id: 'CSC-2026-01',
    label: 'Bepalingsmethode materiaalgebonden CO2-opslag v1.0 (26-01-2026)',
    superseded_by: 'CSC-2026-02',
    /** Modules summed by Variant 4.iii. */
    variant3Modules: ['A1A3', 'A4', 'A5'],
    /** Variant 4.iv divides by (1 + omega/100). */
    variant4MoistureDivisor: true,
    variant4Cf: 0.45,
    /** Minimum Reference Service Life in years (EU CRCF). */
    minRslYears: 35,
    /** Binary gate rather than a lifespan multiplier. */
    lifespanMultiplier: false,
    /** v1.0 excluded NMD category 3 outright. */
    nmdCategoryPolicy: 'exclude-cat3',
    /** v1.0 named NMD milieuverklaringen as an admissible data source. */
    nmdAsDataSource: true,
    variants: ['4.i', '4.ii', '4.iii', '4.iv'],
    /** Preference order from par. 3.3. */
    variantPreference: ['4.i', '4.ii', '4.iii', '4.iv'],
    /** Box 5: automated software must use Variant 3. */
    softwareMustUseVariant3: true,
  },

  'CSC-2026-02': {
    id: 'CSC-2026-02',
    label: 'Bepalingsmethode materiaalgebonden CO2-opslag v1.1 (06-07-2026)',
    superseded_by: null,
    variant3Modules: ['A1A3', 'A4', 'A5'],
    variant4MoistureDivisor: true,
    variant4Cf: 0.45,
    minRslYears: 35,
    lifespanMultiplier: false,
    /**
     * v1.1 replaced the cat-3 exclusion with de-scaling: multipliers applied inside calculation
     * software (1.3 uplift for cat-3, 0.2 discount for unforeseen reuse) must be divided back out.
     * DISABLED BY DEFAULT: it is not established that the 1.3 surcharge touches GWP-biogenic at all
     * rather than only MKI, and dividing wrongly deflates every row by 23%. Question is out with
     * the method owner. Never enable this when reading a manufacturer EPD directly — these are
     * calculation-software artefacts, not EPD content.
     */
    nmdCategoryPolicy: 'descale',
    descaleFactors: { category3: 1.3, unforeseenReuse: 0.2 },
    descaleEnabled: false,
    /** v1.1 removed NMD milieuverklaringen as a data source (source data not public). */
    nmdAsDataSource: false,
    variants: ['4.i', '4.ii', '4.iii', '4.iv'],
    variantPreference: ['4.i', '4.ii', '4.iii', '4.iv'],
    softwareMustUseVariant3: true,
  },

  'ONCRA-BP-1.0': {
    id: 'ONCRA-BP-1.0',
    label: 'ONCRA Certification Protocol Biobased Construction/Products v1.0 (2024)',
    superseded_by: null,
    /** DELTA: A1-A3 only, where the Bepalingsmethode sums A1..A5. */
    variant3Modules: ['A1A3'],
    /** DELTA: no moisture divisor in 4.iv. */
    variant4MoistureDivisor: false,
    variant4Cf: 0.45,
    minRslYears: 35,
    /** Lifespan multiplier explicitly dropped (protocol footnote 6). */
    lifespanMultiplier: false,
    /** L_total = L_use + v * L_reuse, v = 0 unless substantiated. L_reuse <= L_use. */
    reuseLifespan: { enabled: true, defaultV: 0, maxReuseFactor: 1 },
    nmdCategoryPolicy: 'none',
    nmdAsDataSource: false,
    /** DELTA: 4.v exists here and has no counterpart in the Bepalingsmethode. */
    variants: ['4.i', '4.ii', '4.iii', '4.iv', '4.v'],
    variantPreference: ['4.i', '4.ii', '4.iii', '4.iv', '4.v'],
    softwareMustUseVariant3: false,
  },
}

/** @param {RulesetId} id */
export function getRuleset(id) {
  const rs = RULESETS[id]
  if (!rs) throw new Error(`Unknown ruleset "${id}". Known: ${Object.keys(RULESETS).join(', ')}`)
  return rs
}
