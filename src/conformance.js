/**
 * The conformance suite as DATA.
 *
 * One source of truth, consumed by both the Node test runner and the published page, so a case
 * can never pass in one place and fail in the other. Any implementation of the determination
 * method should reproduce these. If yours does not, one of us is wrong and it is worth finding
 * out which.
 *
 * Every case cites a real document. Two come from the method's own worked examples; the rest are
 * verified EN15804+A2 EPDs where the prescribed variant behaves in ways the method does not
 * describe.
 */

import { formula2a, formula3, computeRow, formula5, formula6, sumGwpBiogenic } from './csc.js'
import { CARBON_FRACTIONS, CO2_PER_C } from './rulesets.js'

/**
 * @typedef {object} Case
 * @property {string} id
 * @property {string} title
 * @property {string} source
 * @property {string} why           what this case is protecting against
 * @property {() => {label:string, got:number|string|boolean, want:number|string|boolean, tol?:number}[]} run
 */

/** @type {Case[]} */
export const CASES = [
  {
    id: 'norm-straw',
    title: 'Tarwestro-inblaasisolatie',
    source: 'Bepalingsmethode, par. 3.2, rekenvoorbeeld 1',
    why: 'De basisformule 2a, inclusief de vochtcorrectie. Als deze afwijkt klopt er niets.',
    run() {
      const { cb, pco2 } = formula2a({
        cf: CARBON_FRACTIONS.tarwestro.cf,
        density: 105,
        volume: 0.1,
        moisturePct: 13,
      })
      return [
        { label: 'kg C per m²', got: cb, want: 4.34, tol: 0.005 },
        { label: 'kg CO₂ per m²', got: pco2, want: 15.91, tol: 0.005 },
        { label: 'kg CO₂ per m³', got: pco2 * 10, want: 159.1, tol: 0.05 },
      ]
    },
  },
  {
    id: 'norm-clt',
    title: 'CLT, samengesteld 99% hout / 1% lijm',
    source: 'Bepalingsmethode, par. 3.2, rekenvoorbeeld 2',
    why: 'Formule 3 voor samengestelde producten, met de EN16449-standaardwaarde cf = 0,5.',
    run() {
      const wood = formula2a({ cf: 0.5, density: 470, volume: 1, moisturePct: 11 })
      const total = formula3([
        { cb: wood.cb, fraction: 0.99 },
        { cb: 0, fraction: 0.01 },
      ])
      return [
        { label: 'kg C per m³ (houtcomponent)', got: wood.cb, want: 211.71, tol: 0.005 },
        { label: 'kg C per m³ (totaal)', got: total.cb, want: 209.59, tol: 0.005 },
        { label: 'kg CO₂ per m³ CLT', got: total.pco2, want: 768.51, tol: 0.01 },
      ]
    },
  },
  {
    id: 'screws-packaging',
    title: 'Staalschroeven: verpakkingskoolstof',
    source: 'ÖKOBAUDAT EPD-AWU-20230570-CBA1-EN (EN15804+A2)',
    why:
      'De biogene opname van de verpakking staat in A1–A3 en komt in A5 weer vrij. Wie alleen ' +
      'A1–A3 leest — zoals de referentie-spreadsheet — fabriceert opgeslagen CO₂ uit staal.',
    run() {
      const modules = { A1A3: -0.0753504, A4: 0.0000195, A5: 0.078639 }
      const full = -1 * sumGwpBiogenic(modules, ['A1A3', 'A4', 'A5']).sum
      const partial = -1 * sumGwpBiogenic(modules, ['A1A3']).sum
      return [
        { label: 'A1–A5 som (correct), kg CO₂e/kg', got: full, want: 0, tol: 0.005 },
        { label: 'alleen A1–A3, kg CO₂e/kg', got: partial, want: 0.0753504, tol: 1e-9 },
        { label: 'verzonnen opslag op 15 ton, kg CO₂e', got: partial * 15000, want: 1130.256, tol: 0.01 },
      ]
    },
  },
  {
    id: 'spruce-blocked',
    title: 'Vurenhout met niet-gedeclareerde A4/A5',
    source: 'Sveden Trä EPD-IES-0031212:001 (EN15804+A2, geldig t/m 2031)',
    why:
      'Variant 3 is verplicht voor rekensoftware maar hier niet af te leiden. Terugvallen op ' +
      'een andere variant zou een niet-conform getal opleveren, dus de regel blokkeert.',
    run() {
      const row = computeRow(
        {
          name: 'Sveden Trä geschaafd vuren',
          quantity: 1,
          epd: { registration: 'EPD-IES-0031212:001', standard: 'EN15804+A2', datasetType: 'specific', validUntil: '2031-01-01' },
          rslYears: 50,
          rslSource: 'user_asserted',
          gwpBiogenic: { A1A3: 2.47 },
          cBioPerUnit: 230.0,
        },
        { ruleset: 'CSC-2026-02' }
      )
      return [
        { label: 'Variant 3 af te leiden?', got: row.computed['4.iii'] !== undefined, want: false },
        { label: 'blokkeert op', got: row.blocking.includes('modules_incomplete'), want: true },
        { label: 'status', got: row.status, want: 'buiten_norm' },
        { label: 'Variant 2 (alleen ter info), kg CO₂e/m³', got: row.computed['4.ii'], want: 843.33, tol: 0.01 },
      ]
    },
  },
  {
    id: 'spruce-negative',
    title: 'Zelfde vurenhout, A4/A5 als nul gelezen',
    source: 'Sveden Trä EPD-IES-0031212:001',
    why:
      'Wat een naïeve tool stilzwijgend doet. Variant 3 geeft dan négatieve opslag voor massief ' +
      'vurenhout, tegen 230 kg C die de EPD zelf in het product declareert.',
    run() {
      const row = computeRow(
        {
          name: 'Sveden Trä, A4/A5 = 0',
          quantity: 1,
          epd: { registration: 'EPD-IES-0031212:001', standard: 'EN15804+A2', datasetType: 'specific', validUntil: '2031-01-01' },
          rslYears: 50,
          rslSource: 'user_asserted',
          gwpBiogenic: { A1A3: 2.47, A4: 0, A5: 0 },
          cBioPerUnit: 230.0,
        },
        { ruleset: 'CSC-2026-02' }
      )
      return [
        { label: 'Variant 3, kg CO₂e/m³', got: row.computed['4.iii'], want: -2.47, tol: 1e-9 },
        { label: 'Variant 2, kg CO₂e/m³', got: row.computed['4.ii'], want: 843.33, tol: 0.01 },
        { label: 'teken gemarkeerd', got: row.blocking.includes('variant3_sign_implausible'), want: true },
        { label: 'status', got: row.status, want: 'buiten_norm' },
      ]
    },
  },
  {
    id: 'atibt-divergence',
    title: 'Vlonderhout: Variant 3 is niet conservatief',
    source: 'INIES 20230634171, ATIBT (AFNOR-geverifieerd, geldig t/m 2031-02-26)',
    why:
      'De Bepalingsmethode stelt letterlijk dat de uitkomst "altijd conservatief" is. Hier zit ' +
      'Variant 3 er 105,6% boven, door een negatieve A5 die de onderconstructie meetelt.',
    run() {
      const row = computeRow(
        {
          name: 'ATIBT vlonderhout',
          quantity: 1,
          epd: { registration: '20230634171', standard: 'EN15804+A2', datasetType: 'specific', validUntil: '2031-02-26' },
          rslYears: 50,
          rslSource: 'epd',
          gwpBiogenic: { A1A3: -30.475, A4: 0, A5: -32.091 },
          cBioPerUnit: 30.433 / CO2_PER_C,
        },
        { ruleset: 'CSC-2026-02' }
      )
      return [
        { label: 'Variant 3, kg CO₂e/m²', got: row.computed['4.iii'], want: 62.566, tol: 0.01 },
        { label: 'Variant 2, kg CO₂e/m²', got: row.computed['4.ii'], want: 30.433, tol: 0.01 },
        { label: 'afwijking', got: `+${(row.divergence * 100).toFixed(1)}%`, want: '+105.6%' },
        { label: 'status', got: row.status, want: 'buiten_norm' },
      ]
    },
  },
  {
    id: 'negative-clamp',
    title: 'Beton: negatieve Variant 3 mag niet aftrekken',
    source: 'INIES 20240839958-FCe (AFNOR-geverifieerd, geldig t/m 2029-12-31)',
    why:
      'Formule 5 is een kale som zonder clamping-regel. Letterlijk gelezen trekt een negatieve ' +
      'uitkomst van het gebouwtotaal af. Hier draagt de regel 0 bij en wordt gemarkeerd.',
    run() {
      const row = computeRow(
        {
          name: 'betonfundering',
          quantity: 1250,
          epd: { registration: '20240839958-FCe', standard: 'EN15804+A2', datasetType: 'specific', validUntil: '2029-12-31' },
          rslYears: 100,
          rslSource: 'epd',
          gwpBiogenic: { A1A3: 0.1475, A4: 0, A5: 1.18 },
        },
        { ruleset: 'CSC-2026-02' }
      )
      const total = formula5([row])
      return [
        { label: 'Variant 3 negatief?', got: row.computed['4.iii'] < 0, want: true },
        { label: 'gemarkeerd', got: row.blocking.includes('negative_variant3'), want: true },
        { label: 'bijdrage aan gebouwtotaal, kg CO₂e', got: total.officialKgCO2e, want: 0, tol: 1e-9 },
      ]
    },
  },
  {
    id: 'ruleset-delta',
    title: 'Dezelfde EPD, twee protocollen, twee getallen',
    source: 'CSC-2026-02 Box 5 vs. ONCRA-BP-1.0 §2.1.3',
    why:
      'De Bepalingsmethode sommeert A1–A5, het ONCRA-protocol alleen A1–A3 — en dat laatste is ' +
      'het protocol dat in de aanbestedingen van 2026 wordt genoemd. Wie de ruleset niet ' +
      'vastlegt, publiceert een getal dat niemand kan reproduceren.',
    run() {
      const row = {
        name: 'houtproduct',
        quantity: 1,
        epd: { registration: 'R', standard: 'EN15804+A2', datasetType: 'specific', validUntil: '2031-01-01' },
        rslYears: 50,
        rslSource: 'epd',
        gwpBiogenic: { A1A3: -700, A4: 0.5, A5: 40 },
      }
      const a = computeRow(row, { ruleset: 'CSC-2026-02' })
      const b = computeRow(row, { ruleset: 'ONCRA-BP-1.0', isAutomatedSoftware: false })
      return [
        { label: 'CSC-2026-02 (A1–A5), kg CO₂e', got: a.computed['4.iii'], want: 659.5, tol: 1e-9 },
        { label: 'ONCRA-BP-1.0 (A1–A3), kg CO₂e', got: b.computed['4.iii'], want: 700, tol: 1e-9 },
      ]
    },
  },
  {
    id: 'poppies',
    title: 'Poppies, Amsterdam-Noord: gecertificeerd totaal gereproduceerd',
    source: 'Oncra-register RJM-C-001; DERIX MRPI 1.1.00667.2024 en 1.1.00666.2024',
    why:
      'Waar de data bestaat, werkt de methode. Twee EPD-regels over het gedocumenteerde ' +
      'houtvolume van 2.369 m³ reproduceren de gecertificeerde 1.826 ton binnen 0,1%.',
    run() {
      const rows = [
        computeRow(
          {
            name: 'DERIX X-LAM',
            quantity: 2220,
            epd: { registration: 'MRPI 1.1.00667.2024', standard: 'EN15804+A2', datasetType: 'specific', validUntil: '2029-01-01' },
            rslYears: 100,
            rslSource: 'epd',
            gwpBiogenic: { A1A3: -770.141, A4: 0, A5: 0 },
          },
          {}
        ),
        computeRow(
          {
            name: 'DERIX gelamineerd hout',
            quantity: 149,
            epd: { registration: 'MRPI 1.1.00666.2024', standard: 'EN15804+A2', datasetType: 'specific', validUntil: '2029-01-01' },
            rslYears: 100,
            rslSource: 'epd',
            gwpBiogenic: { A1A3: -771.0, A4: 0, A5: 0 },
          },
          {}
        ),
      ]
      const t = formula6(formula5(rows).officialKgCO2e)
      return [
        { label: 'berekend totaal, ton CO₂e', got: t, want: 1826, tol: 3 },
        {
          label: 'afwijking t.o.v. certificering, %',
          got: ((t - 1826) / 1826) * 100,
          want: 0,
          tol: 0.1,
        },
      ]
    },
  },
]

/** Run every case and return a flat, renderable result set. */
export function runConformance() {
  return CASES.map((c) => {
    let checks = []
    let error = null
    try {
      checks = c.run().map((chk) => {
        const pass =
          typeof chk.want === 'number' && typeof chk.got === 'number'
            ? Math.abs(chk.got - chk.want) <= (chk.tol ?? 0)
            : chk.got === chk.want
        return { ...chk, pass }
      })
    } catch (e) {
      error = e.message
    }
    return {
      id: c.id,
      title: c.title,
      source: c.source,
      why: c.why,
      checks,
      error,
      pass: !error && checks.every((k) => k.pass),
    }
  })
}
