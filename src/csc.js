/**
 * Calculation core for material-bound CO2 storage (Construction Stored Carbon).
 *
 * Design rules, all of them load-bearing:
 *  1. Every result carries WHICH ruleset, WHICH variant, and WHY that variant was chosen.
 *     Provenance is a return value, not a log line.
 *  2. Eligibility rules BLOCK with a machine-readable reason. They are never a column that
 *     reports while the number flows into the total anyway.
 *  3. Nothing is silently defaulted. A missing RSL is `rsl_unknown` and blocks; it is not 0
 *     and it is not "probably fine".
 *  4. When two variants are both derivable, compute BOTH and block on disagreement. Variant
 *     4.iii is demonstrably non-conservative and can be sign-wrong (see test fixtures), while
 *     the norm asserts it is always conservative.
 *
 * @typedef {import('./rulesets.js').RulesetId} RulesetId
 */

import { CO2_PER_C, getRuleset } from './rulesets.js'
import { lookupServiceLife } from './service-life.js'

/* ------------------------------------------------------------------ *
 * Formulas 2a / 2b / 3 — biogenic carbon content from physical inputs
 * ------------------------------------------------------------------ */

/**
 * Formula 2a — volume basis. Cb = cf * (rho_w * V_w) / (1 + omega/100)
 * @param {{cf:number, density:number, volume:number, moisturePct:number}} p
 * @returns {{cb:number, pco2:number}} kg C and kg CO2e
 */
export function formula2a({ cf, density, volume, moisturePct }) {
  requireFinite({ cf, density, volume, moisturePct })
  const cb = (cf * (density * volume)) / (1 + moisturePct / 100)
  return { cb, pco2: CO2_PER_C * cb }
}

/**
 * Formula 2b — mass basis. Cb = cf * M_w / (1 + omega/100)
 * Prefer this over 2a whenever the declared unit is a mass: it sidesteps density entirely,
 * and density is the field most often missing for agro-based materials.
 * @param {{cf:number, mass:number, moisturePct:number}} p
 */
export function formula2b({ cf, mass, moisturePct }) {
  requireFinite({ cf, mass, moisturePct })
  const cb = (cf * mass) / (1 + moisturePct / 100)
  return { cb, pco2: CO2_PER_C * cb }
}

/**
 * Formula 3 — composite products. Cb_tot = sum(Cb_i * f_i), with sum(f_i) = 1.
 * @param {Array<{cb:number, fraction:number}>} components
 */
export function formula3(components) {
  const sumF = components.reduce((s, c) => s + c.fraction, 0)
  if (Math.abs(sumF - 1) > 1e-6) {
    const err = new Error(`Component fractions sum to ${sumF}, must be 1`)
    err.code = 'fractions_not_summing_to_one'
    throw err
  }
  const cb = components.reduce((s, c) => s + c.cb * c.fraction, 0)
  return { cb, pco2: CO2_PER_C * cb }
}

/* ------------------------------------------------------------------ *
 * Formula 4 — CSC per product, four (or five) variants
 * ------------------------------------------------------------------ */

/**
 * Sum GWP-biogenic over the modules the active ruleset prescribes.
 *
 * PRECISION RULE: never sum rounded printed A1, A2 and A3 components when a declared A1-A3
 * aggregate exists. Measured gap on a real EPD: 2.03 kg CO2e/m3. The aggregate wins and the
 * choice is recorded.
 *
 * @param {Record<string, number|null|undefined>} modules e.g. {A1A3:-762, A4:0.006, A5:0.34}
 * @param {string[]} required
 */
export function sumGwpBiogenic(modules, required, optional = []) {
  const used = {}
  const missing = []
  const notDeclared = []
  let usedAggregate = false

  for (const key of required) {
    let v = modules[key]
    if (key === 'A1A3' && (v === undefined || v === null)) {
      // fall back to components only if the aggregate is genuinely absent
      const parts = ['A1', 'A2', 'A3'].map((k) => modules[k])
      if (parts.every((p) => typeof p === 'number')) {
        v = parts.reduce((a, b) => a + b, 0)
      }
    } else if (key === 'A1A3' && typeof v === 'number') {
      usedAggregate = true
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      // A module the ruleset marks optional (A4 = transport to site) is legitimately not
      // declared in a cradle-to-gate product declaration. Treat as zero, but record it —
      // an interpretation must never be invisible.
      if (optional.includes(key)) notDeclared.push(key)
      else missing.push(key)
      continue
    }
    used[key] = v
  }

  const sum = Object.values(used).reduce((a, b) => a + b, 0)
  return { sum, used, missing, notDeclared, usedAggregate }
}

/**
 * Compute one product row.
 *
 * @param {object} row
 * @param {string} row.name
 * @param {number} row.quantity              number of declared units (N)
 * @param {number} [row.scaling=1]           dimensionless scaling factor (v1.1 rectified the unit)
 * @param {boolean} [row.biobased=true]
 * @param {object} [row.epd]
 * @param {string} [row.epd.registration]    registration number — required for an official determination
 * @param {string} [row.epd.validUntil]      ISO date
 * @param {'EN15804+A2'|'EN15804+A1'|string} [row.epd.standard]
 * @param {'specific'|'representative'|'generic'} [row.epd.datasetType]
 * @param {number|null} [row.rslYears]
 * @param {string} [row.rslSource]           'epd' | 'reference_table' | 'user_asserted' | 'unknown'
 * @param {string} [row.rslReference]        BBSR element reference, required when rslSource is 'reference_table'
 * @param {Record<string,number>} [row.gwpBiogenic]     per module, kg CO2e per declared unit
 * @param {number} [row.co2BioPerUnit]                  Variant 4.i input, kg CO2e per unit, excl. packaging
 * @param {number} [row.cBioPerUnit]                    Variant 4.ii input, kg C per unit, excl. packaging
 * @param {object} [row.physical]                       Variant 4.iv inputs {density, moisturePct, woodyFraction}
 * @param {object} [opts]
 * @param {RulesetId} [opts.ruleset='CSC-2026-02']
 * @param {boolean} [opts.isAutomatedSoftware=true]     Box 5 applies to automated calculation software
 * @param {number} [opts.divergenceThreshold=0.05]      block when 4.ii and 4.iii disagree by more than this
 */
export function computeRow(row, opts = {}) {
  const rulesetId = opts.ruleset ?? 'CSC-2026-02'
  const rs = getRuleset(rulesetId)
  const isSoftware = opts.isAutomatedSoftware ?? true
  const threshold = opts.divergenceThreshold ?? 0.05

  const blocking = []
  const flags = []
  const scaling = row.scaling ?? 1
  const N = row.quantity

  const out = {
    name: row.name,
    ruleset: rulesetId,
    status: 'buiten_norm',
    variantUsed: null,
    variantReason: null,
    cscPerUnit: null,
    csc: null,
    blocking,
    flags,
    computed: {},
  }

  if (row.biobased === false) {
    out.status = 'niet_biobased'
    blocking.push('not_biobased')
    out.csc = 0
    return out
  }

  /* ---- candidate variants ------------------------------------------------ */

  // Variant 4.i — kg CO2e per unit, excluding packaging
  if (typeof row.co2BioPerUnit === 'number') {
    out.computed['4.i'] = row.co2BioPerUnit
  }
  // Variant 4.ii — kg C per unit, excluding packaging
  if (typeof row.cBioPerUnit === 'number') {
    out.computed['4.ii'] = row.cBioPerUnit * CO2_PER_C
  }
  // Variant 4.iii — -1 * sum of GWP-biogenic over the ruleset's modules
  let v3 = null
  if (row.gwpBiogenic) {
    v3 = sumGwpBiogenic(row.gwpBiogenic, rs.variant3Modules, rs.variant3OptionalModules ?? [])
    if (v3.missing.length === 0) {
      out.computed['4.iii'] = -1 * v3.sum
    } else {
      flags.push(`modules_missing:${v3.missing.join('+')}`)
    }
    if (v3.usedAggregate) flags.push('aggregate_preferred_over_components')
    if (v3.notDeclared.length) flags.push(`modules_not_declared_treated_as_zero:${v3.notDeclared.join('+')}`)
  }
  // Variant 4.iv — indicative fallback, wood >= 95% woody biomass
  if (row.physical && typeof row.physical.density === 'number') {
    const woody = row.physical.woodyFraction ?? 1
    if (woody >= 0.95) {
      const divisor = rs.variant4MoistureDivisor
        ? 1 + (row.physical.moisturePct ?? 12) / 100
        : 1
      out.computed['4.iv'] = (CO2_PER_C * rs.variant4Cf * row.physical.density) / divisor
    } else {
      flags.push('variant4iv_requires_95pct_woody')
    }
  }

  /* ---- variant selection ------------------------------------------------- */

  let chosen = null
  const variant3Mandatory = isSoftware && rs.softwareMustUseVariant3

  if (variant3Mandatory && out.computed['4.iii'] !== undefined) {
    chosen = '4.iii'
    out.variantReason = `Box 5: Variant 3 verplicht voor rekensoftware (${rulesetId})`
  } else {
    // Variant 3 is mandatory but not derivable: the modules are not declared. Falling back to
    // another variant would produce a number that does not conform, so the row is blocked.
    // A fallback IS computed and reported for information — it is what the row would be worth
    // if the EPD declared A4 and A5 — but it never enters the official total.
    if (variant3Mandatory && row.gwpBiogenic) {
      blocking.push('modules_incomplete')
      out.variantReason = `Variant 3 verplicht maar niet af te leiden; ontbrekende modules: ${
        v3 ? v3.missing.join(', ') : 'onbekend'
      }`
    }
    for (const v of rs.variantPreference) {
      if (out.computed[v] !== undefined) {
        chosen = v
        out.variantReason =
          out.variantReason ?? `voorkeursvolgorde par. 3.3 (${rulesetId})`
        break
      }
    }
  }

  if (!chosen) {
    blocking.push('no_usable_data')
    return out
  }

  /* ---- cross-variant sanity: the norm claims 4.iii is always conservative -- */

  if (out.computed['4.ii'] !== undefined && out.computed['4.iii'] !== undefined) {
    const a = out.computed['4.ii']
    const b = out.computed['4.iii']
    const base = Math.max(Math.abs(a), 1e-9)
    const delta = (b - a) / base
    out.divergence = delta
    if (Math.abs(delta) > threshold) {
      blocking.push('variant_disagreement')
      flags.push(`divergence:${(delta * 100).toFixed(1)}%`)
    }
  }

  // A declared biogenic carbon content that disagrees in SIGN with Variant 3 means the EPD does
  // not book product carbon into GWP-biogenic at all. Observed on a real +A2 spruce EPD.
  if (chosen === '4.iii' && typeof row.cBioPerUnit === 'number' && row.cBioPerUnit > 0) {
    if (out.computed['4.iii'] <= 0) {
      blocking.push('variant3_sign_implausible')
    }
  }

  // Formula 5 is a plain sum with no clamping rule and the norm gives no instruction.
  // A negative Variant 3 result is not storage; it contributes 0 and is flagged, never subtracted.
  if (chosen === '4.iii' && out.computed['4.iii'] < 0) {
    blocking.push('negative_variant3')
  }

  out.variantUsed = chosen
  out.cscPerUnit = out.computed[chosen]
  out.csc = out.cscPerUnit * scaling * N

  /* ---- eligibility gates ------------------------------------------------- */

  const isIndicative = chosen === '4.iv'

  if (!isIndicative) {
    const epd = row.epd
    if (!epd || !epd.registration) {
      blocking.push('no_verified_epd')
    } else {
      if (epd.standard && epd.standard !== 'EN15804+A2') blocking.push('epd_not_a2')
      // Par. 3.5 Tabel 2 demands a registration number; only a real EPD can fill that cell.
      if (epd.datasetType && epd.datasetType !== 'specific') blocking.push('not_a_specific_epd')
      if (epd.validUntil) {
        const until = Date.parse(epd.validUntil)
        const now = opts.today ? Date.parse(opts.today) : Date.parse('2026-07-30')
        if (Number.isFinite(until) && until < now) blocking.push('epd_expired')
      }
    }
  }

  // Service life. Never defaulted, never guessed. A reference-table value is a proposal that the
  // row must opt into by naming the element, and the output says so.
  let rslYears = row.rslYears
  if (row.rslSource === 'reference_table') {
    const e = row.rslReference ? lookupServiceLife(row.rslReference) : null
    if (!e) {
      blocking.push('rsl_reference_unknown')
    } else {
      rslYears = e.years
      out.rslResolved = { years: e.years, isMinimum: !!e.min, ref: row.rslReference, source: e.source }
      flags.push(`rsl_from_reference_table:${row.rslReference}`)
    }
  }

  if (rslYears === undefined || rslYears === null || row.rslSource === 'unknown') {
    blocking.push('rsl_unknown')
  } else if (rslYears < rs.minRslYears) {
    blocking.push('rsl_lt_35')
  }

  /* ---- status ------------------------------------------------------------ */

  if (blocking.length === 0) {
    out.status = isIndicative ? 'indicatief' : 'bepaald'
  } else if (isIndicative && blocking.every((b) => b === 'rsl_unknown')) {
    // 4.iv is indicative by construction; it never enters the official total anyway.
    out.status = 'indicatief'
  } else {
    out.status = 'buiten_norm'
  }

  return out
}

/* ------------------------------------------------------------------ *
 * Formulas 5 and 6 — building level
 * ------------------------------------------------------------------ */

/**
 * Formula 5 — CSC_total = sum(CSC_i), over eligible rows ONLY.
 * Returns three totals, never one: official, indicative, excluded. Box 5's last bullet requires
 * stating clearly which products do and do not contribute.
 * @param {ReturnType<typeof computeRow>[]} rows
 */
export function formula5(rows) {
  const official = rows.filter((r) => r.status === 'bepaald')
  const indicative = rows.filter((r) => r.status === 'indicatief')
  const excluded = rows.filter((r) => r.status === 'buiten_norm' || r.status === 'niet_biobased')
  const sum = (rs) => rs.reduce((s, r) => s + (r.csc ?? 0), 0)
  return {
    officialKgCO2e: sum(official),
    indicativeKgCO2e: sum(indicative),
    counts: { official: official.length, indicative: indicative.length, excluded: excluded.length },
    excluded: excluded.map((r) => ({ name: r.name, reasons: r.blocking })),
  }
}

/** Formula 6 — CR_total in tonnes, feeding the CRCF net carbon removal benefit. */
export function formula6(cscTotalKgCO2e) {
  return cscTotalKgCO2e / 1000
}

/* ------------------------------------------------------------------ */

function requireFinite(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`"${k}" must be a finite number, got ${v}`)
    }
  }
}
