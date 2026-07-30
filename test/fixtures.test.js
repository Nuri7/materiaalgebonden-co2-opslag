/**
 * The conformance fixture suite.
 *
 * These are the cases any implementation of the method should reproduce. Two come from the
 * norm's own worked examples; the rest are real, verified EN15804+A2 EPDs where the mandated
 * variant behaves in ways the norm does not describe.
 *
 * Run: node --test test/
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formula2a, formula3, computeRow, formula5, formula6, sumGwpBiogenic } from '../src/csc.js'
import { CARBON_FRACTIONS } from '../src/rulesets.js'

const close = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, expected ${b} (±${tol})`)

/* ================================================================== *
 * 1. The norm's own worked examples. These must reproduce exactly.
 * ================================================================== */

test("norm example 1 — wheat-straw blow-in insulation (par. 3.2)", () => {
  // cf 0.467, rho 105 kg/m3, omega 13%, reference thickness 100 mm, declared unit 1 m2
  const { cb, pco2 } = formula2a({
    cf: CARBON_FRACTIONS.tarwestro.cf,
    density: 105,
    volume: 0.1, // 1 m2 x 0.1 m
    moisturePct: 13,
  })
  close(cb, 4.34, 0.005, 'kg C per m2')
  close(pco2, 15.91, 0.005, 'kg CO2 per m2')
  close(pco2 * 10, 159.1, 0.05, 'kg CO2 per m3')
})

test("norm example 2 — CLT, composite 99% wood / 1% glue (par. 3.2)", () => {
  // rho 470 kg/m3, omega 11%, cf 0.5 (mixed species, EN16449 standard value), 1 m3
  const wood = formula2a({
    cf: CARBON_FRACTIONS.hout_en16449.cf,
    density: 470,
    volume: 1,
    moisturePct: 11,
  })
  close(wood.cb, 211.71, 0.005, 'kg C per m3, wood component')

  const total = formula3([
    { cb: wood.cb, fraction: 0.99 },
    { cb: 0, fraction: 0.01 }, // glue assumed 0 kg C in the norm's example
  ])
  close(total.cb, 209.59, 0.005, 'kg C per m3, composite')
  close(total.pco2, 768.51, 0.01, 'kg CO2 per m3 CLT')
})

test('composite fractions must sum to 1', () => {
  assert.throws(
    () => formula3([{ cb: 100, fraction: 0.9 }, { cb: 0, fraction: 0.05 }]),
    /must be 1/
  )
})

/* ================================================================== *
 * 2. Real EPDs where the mandated Variant 3 misbehaves.
 *    Each of these is a defect the incumbent spreadsheet ships.
 * ================================================================== */

test('packaging: steel screws must report ~0, not +0.075/kg', () => {
  // OKOBAUDAT EPD-AWU-20230570-CBA1-EN. Biogenic uptake of the packaging sits in A1-A3 and is
  // released again in A5. Reading A1-A3 alone manufactures stored carbon out of steel screws.
  const modules = { A1A3: -0.0753504, A4: 0.0000195, A5: 0.078639 }

  const full = sumGwpBiogenic(modules, ['A1A3', 'A4', 'A5'])
  close(-1 * full.sum, 0, 0.005, 'correct A1..A5 sum is ~0')

  const wrong = sumGwpBiogenic(modules, ['A1A3'])
  close(-1 * wrong.sum, 0.0753504, 1e-9, 'A1-A3 alone')

  // over 15 tonnes of screws the difference is >1100 kg of carbon that does not exist
  const bogus = -1 * wrong.sum * 15000
  assert.ok(bogus > 1100, `A1-A3-only invents ${bogus.toFixed(0)} kg CO2e on 15 t of screws`)
})

test('undeclared A4/A5: mandatory Variant 3 is not derivable, so the row BLOCKS', () => {
  // Sveden Trae EPD-IES-0031212:001, planed spruce, EN15804+A2, valid to 2031.
  // Declares GWP-biogenic A1-A3 = +2.47 kg CO2e/m3 with A4 = ND and A5 = ND, while declaring
  // 230.0 kg C biogenic carbon in the product. Box 5 makes Variant 3 mandatory for software;
  // it cannot be derived here, and falling back to Variant 2 would produce a non-conforming
  // figure. The honest answer is to block and say which modules are missing.
  const row = computeRow(
    {
      name: 'Sveden Tra planed spruce',
      quantity: 1,
      epd: { registration: 'EPD-IES-0031212:001', standard: 'EN15804+A2', datasetType: 'specific', validUntil: '2031-01-01' },
      rslYears: 50,
      rslSource: 'user_asserted',
      gwpBiogenic: { A1A3: 2.47 },
      cBioPerUnit: 230.0,
    },
    { ruleset: 'CSC-2026-02' }
  )

  assert.equal(row.computed['4.iii'], undefined, 'Variant 3 is not derivable')
  assert.ok(row.blocking.includes('modules_incomplete'))
  assert.ok(row.flags.some((f) => f.startsWith('modules_missing:')))
  assert.equal(row.status, 'buiten_norm')
  // The informational fallback shows what the row would be worth: the physically correct value.
  close(row.computed['4.ii'], 843.33, 0.01, 'Variant 2 result, for information only')
})

test('sign: if A4/A5 are justified as zero, Variant 3 goes negative on solid spruce', () => {
  // Same EPD, now with A4 and A5 explicitly justified as 0 — which is what a naive tool assumes
  // silently. Variant 3 then returns NEGATIVE stored carbon for solid spruce, against a declared
  // 230 kg C in the product. The sign gate must catch it.
  const row = computeRow(
    {
      name: 'Sveden Tra planed spruce (A4/A5 justified zero)',
      quantity: 1,
      epd: { registration: 'EPD-IES-0031212:001', standard: 'EN15804+A2', datasetType: 'specific', validUntil: '2031-01-01' },
      rslYears: 50,
      rslSource: 'user_asserted',
      gwpBiogenic: { A1A3: 2.47, A4: 0, A5: 0 },
      cBioPerUnit: 230.0,
    },
    { ruleset: 'CSC-2026-02' }
  )

  close(row.computed['4.iii'], -2.47, 1e-9, 'Variant 3 result')
  close(row.computed['4.ii'], 843.33, 0.01, 'Variant 2 result')
  assert.ok(row.blocking.includes('variant3_sign_implausible'), 'must flag the sign')
  assert.ok(row.blocking.includes('negative_variant3'))
  assert.equal(row.status, 'buiten_norm', 'must not enter the official total')
})

test('divergence: 4.ii and 4.iii disagreeing by >5% blocks the row', () => {
  // INIES 20230634171, ATIBT Congo-basin decking. 4.iii = 62.566, 4.ii = 30.433 kg CO2e/m2:
  // +105.6%, caused by a negative A5 (-32.091) booking the substructure's biogenic uptake.
  const row = computeRow(
    {
      name: 'ATIBT decking',
      quantity: 1,
      epd: { registration: '20230634171', standard: 'EN15804+A2', datasetType: 'specific', validUntil: '2031-02-26' },
      rslYears: 50,
      rslSource: 'epd',
      gwpBiogenic: { A1A3: -30.475, A4: 0, A5: -32.091 },
      cBioPerUnit: 30.433 / (44 / 12),
    },
    { ruleset: 'CSC-2026-02' }
  )
  assert.ok(row.divergence > 1.0, `divergence ${(row.divergence * 100).toFixed(1)}% must exceed 100%`)
  assert.ok(row.blocking.includes('variant_disagreement'))
  assert.equal(row.status, 'buiten_norm')
})

test('negative Variant 3 contributes 0 and never subtracts (Formula 5 has no clamping rule)', () => {
  // INIES 20240839958-FCe, concrete foundation: A5 GWP-biogenic 8x the A1-A3 value.
  const row = computeRow(
    {
      name: 'concrete foundation',
      quantity: 1250,
      epd: { registration: '20240839958-FCe', standard: 'EN15804+A2', datasetType: 'specific', validUntil: '2029-12-31' },
      rslYears: 100,
      rslSource: 'epd',
      gwpBiogenic: { A1A3: 0.1475, A4: 0, A5: 1.18 },
    },
    { ruleset: 'CSC-2026-02' }
  )
  assert.ok(row.computed['4.iii'] < 0, 'Variant 3 is negative here')
  assert.ok(row.blocking.includes('negative_variant3'))
  const total = formula5([row])
  assert.equal(total.officialKgCO2e, 0, 'must not subtract from the building total')
})

/* ================================================================== *
 * 3. The gates
 * ================================================================== */

test('RSL is never assumed: unknown blocks, <35 blocks', () => {
  const base = {
    name: 'wood fibre board',
    quantity: 10,
    epd: { registration: 'EPD-X', standard: 'EN15804+A2', datasetType: 'specific', validUntil: '2030-01-01' },
    gwpBiogenic: { A1A3: -100, A4: 0, A5: 0 },
  }
  const unknown = computeRow({ ...base }, {})
  assert.ok(unknown.blocking.includes('rsl_unknown'))
  assert.equal(unknown.status, 'buiten_norm')

  const tooShort = computeRow({ ...base, rslYears: 20, rslSource: 'epd' }, {})
  assert.ok(tooShort.blocking.includes('rsl_lt_35'))

  const ok = computeRow({ ...base, rslYears: 50, rslSource: 'epd' }, {})
  assert.deepEqual(ok.blocking, [])
  assert.equal(ok.status, 'bepaald')
  close(ok.csc, 1000, 1e-9, '100 kg/unit x 10 units')
})

test('an expired EPD blocks, and an EN15804+A1 EPD blocks', () => {
  const base = {
    name: 'x',
    quantity: 1,
    rslYears: 50,
    rslSource: 'epd',
    gwpBiogenic: { A1A3: -10, A4: 0, A5: 0 },
  }
  const expired = computeRow(
    { ...base, epd: { registration: 'E1', standard: 'EN15804+A2', datasetType: 'specific', validUntil: '2026-02-11' } },
    { today: '2026-07-30' }
  )
  assert.ok(expired.blocking.includes('epd_expired'))

  const a1 = computeRow(
    { ...base, epd: { registration: 'E2', standard: 'EN15804+A1', datasetType: 'specific', validUntil: '2030-01-01' } },
    {}
  )
  assert.ok(a1.blocking.includes('epd_not_a2'))
})

test('a generic dataset can never reach bepaald — Tabel 2 demands a registration number', () => {
  const row = computeRow(
    {
      name: 'generic timber',
      quantity: 1,
      rslYears: 50,
      rslSource: 'epd',
      epd: { registration: 'n/a', standard: 'EN15804+A2', datasetType: 'generic', validUntil: '2030-01-01' },
      gwpBiogenic: { A1A3: -700, A4: 0, A5: 0 },
    },
    {}
  )
  assert.ok(row.blocking.includes('not_a_specific_epd'))
})

test('precision: a declared A1-A3 aggregate beats summing rounded components', () => {
  const modules = { A1A3: -771.0, A1: -768.5, A2: -0.2706, A3: -0.2 }
  const r = sumGwpBiogenic(modules, ['A1A3'])
  assert.equal(r.sum, -771.0)
  assert.equal(r.usedAggregate, true)
})

/* ================================================================== *
 * 4. Ruleset deltas — the same EPD under three rule sets
 * ================================================================== */

test('ONCRA-BP-1.0 sums A1-A3 only, the Bepalingsmethode sums A1..A5', () => {
  const row = {
    name: 'timber product',
    quantity: 1,
    epd: { registration: 'R', standard: 'EN15804+A2', datasetType: 'specific', validUntil: '2031-01-01' },
    rslYears: 50,
    rslSource: 'epd',
    gwpBiogenic: { A1A3: -700, A4: 0.5, A5: 40 },
  }
  const csc = computeRow(row, { ruleset: 'CSC-2026-02' })
  const oncra = computeRow(row, { ruleset: 'ONCRA-BP-1.0', isAutomatedSoftware: false })

  close(csc.computed['4.iii'], 659.5, 1e-9, 'A1..A5')
  close(oncra.computed['4.iii'], 700, 1e-9, 'A1-A3 only')
  assert.notEqual(csc.csc, oncra.csc, 'the two protocols give different numbers on the same EPD')
})

test('ONCRA Variant 4.iv has no moisture divisor', () => {
  const row = {
    name: 'sawn timber, no EPD',
    quantity: 1,
    physical: { density: 470, moisturePct: 12, woodyFraction: 1 },
  }
  const csc = computeRow(row, { ruleset: 'CSC-2026-02' })
  const oncra = computeRow(row, { ruleset: 'ONCRA-BP-1.0', isAutomatedSoftware: false })

  close(csc.computed['4.iv'], (44 / 12) * 0.45 * 470 / 1.12, 1e-9, 'with divisor')
  close(oncra.computed['4.iv'], (44 / 12) * 0.45 * 470, 1e-9, 'without divisor')
  assert.equal(csc.status, 'indicatief', '4.iv is indicative by construction')
})

test('de-scaling stays off until the method owner confirms it touches GWP-biogenic', async () => {
  const { RULESETS } = await import('../src/rulesets.js')
  assert.equal(RULESETS['CSC-2026-02'].descaleEnabled, false)
})

/* ================================================================== *
 * 5. Building level — Poppies, reproducing a certified figure
 * ================================================================== */

test('Poppies: two EPD rows reproduce the certified 1826 t to within 0.1%', () => {
  // Oncra registry RJM-C-001. Documented timber volume 2369 m3 over X-LAM + glulam (DERIX).
  // The certified figure is effectively one row: volume x a CLT factor.
  const CLT_FACTOR = 770.141 // kg CO2e/m3, DERIX X-LAM EPD, verified +A2

  const rows = [
    computeRow(
      {
        name: 'DERIX X-LAM',
        quantity: 2220,
        epd: { registration: 'MRPI 1.1.00667.2024', standard: 'EN15804+A2', datasetType: 'specific', validUntil: '2029-01-01' },
        rslYears: 100,
        rslSource: 'epd',
        gwpBiogenic: { A1A3: -CLT_FACTOR, A4: 0, A5: 0 },
      },
      {}
    ),
    computeRow(
      {
        name: 'DERIX glulam',
        quantity: 149,
        epd: { registration: 'MRPI 1.1.00666.2024', standard: 'EN15804+A2', datasetType: 'specific', validUntil: '2029-01-01' },
        rslYears: 100,
        rslSource: 'epd',
        gwpBiogenic: { A1A3: -771.0, A4: 0, A5: 0 },
      },
      {}
    ),
  ]

  const total = formula5(rows)
  const tonnes = formula6(total.officialKgCO2e)
  close(tonnes, 1826, 3, 'certified total in tonnes')
  assert.ok(Math.abs(tonnes - 1826) / 1826 < 0.001, 'within 0.1% of the certified figure')
})

test('Formula 5 reports three totals, never one', () => {
  const rows = [
    computeRow(
      {
        name: 'official',
        quantity: 1,
        epd: { registration: 'R', standard: 'EN15804+A2', datasetType: 'specific', validUntil: '2030-01-01' },
        rslYears: 50,
        rslSource: 'epd',
        gwpBiogenic: { A1A3: -100, A4: 0, A5: 0 },
      },
      {}
    ),
    computeRow({ name: 'indicative', quantity: 1, physical: { density: 470, moisturePct: 12 } }, {}),
    computeRow({ name: 'concrete', quantity: 1, biobased: false }, {}),
  ]
  const t = formula5(rows)
  assert.equal(t.counts.official, 1)
  assert.equal(t.counts.indicative, 1)
  assert.equal(t.counts.excluded, 1)
  close(t.officialKgCO2e, 100, 1e-9, 'official total excludes the indicative row')
  assert.ok(t.excluded[0].reasons.includes('not_biobased'))
})
