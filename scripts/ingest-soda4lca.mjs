#!/usr/bin/env node
/**
 * Ingest EN15804+A2 datasets from ÖKOBAUDAT and derive the inputs the determination method needs.
 *
 * WHY THIS SHIPS AS A SCRIPT AND NOT AS DATA
 * ------------------------------------------
 * ÖKOBAUDAT permits free redistribution of its data *unmodified*, with the source named
 * ("Eine unmodifizierte kostenfreie Weitergabe ist unter Nennung der Quelle zulässig").
 * A converted, filtered, re-keyed extract is modified, and the terms are silent on that — so
 * there is no express permission to publish one. The Thünen datasets themselves carry
 * `copyright: true` and no open-licence statement; the CC-BY publication on OpenAgrar is the
 * research *report*, not the datasets.
 *
 * So we ship the recipe, not the meal. Run this and you rebuild the dataset yourself in about a
 * minute, straight from the source, with no licence question to answer. Output goes to data/,
 * which is git-ignored. This is also better engineering: no stale committed copy of data that
 * expires.
 *
 * Usage:
 *   node scripts/ingest-soda4lca.mjs                              # Thünen wood datasets
 *   node scripts/ingest-soda4lca.mjs --owner Derix                # any owner substring
 *   node scripts/ingest-soda4lca.mjs --node environdec --search "Cross laminated,Glulam"
 *   node scripts/ingest-soda4lca.mjs --all                        # everything (slow)
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { computeRow } from '../src/csc.js'
import { CO2_PER_C } from '../src/rulesets.js'

/**
 * soda4LCA nodes that serve EN15804+A2 data without authentication.
 * They speak the same REST contract but fail in opposite directions — see the summary this
 * script prints. environdec needs retries: its TLS drops connections under load.
 */
const NODES = {
  okobaudat: {
    base: 'https://oekobaudat.de/OEKOBAU.DAT/resource',
    datastock: 'cd2bda71-760b-4fcc-8a0b-3877c10000a8',
    label: 'ÖKOBAUDAT (BBSR/BMWSB)',
    terms: 'unmodified redistribution permitted with the source named',
  },
  environdec: {
    base: 'https://data.environdec.com/resource',
    datastock: '3689a469-b410-4a40-84ef-f5d5a2ed1b18',
    label: 'EPD International (environdec)',
    terms: 'query only — General Terms of Use prohibit storing or redistributing records',
  },
}

/** Both compliance UUIDs mean EN 15804+A2. Filtering on only the first silently drops ~900 records. */
const A2_COMPLIANCE = new Set([
  'c0016b33-8cf7-415c-ac6e-deba0d21440d',
  'd4aa3ec7-b1d7-4a4a-a6cb-37af88dcc902',
])

const args = process.argv.slice(2)
const arg = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)

const nodeName = arg('--node', 'okobaudat')
const NODE = NODES[nodeName]
if (!NODE) {
  console.error(`Unknown node "${nodeName}". Known: ${Object.keys(NODES).join(', ')}`)
  process.exit(1)
}
const BASE = NODE.base
const DATASTOCK = NODE.datastock
const ownerFilter = args.includes('--all') || args.includes('--search') ? null : arg('--owner', 'Thünen')
/** environdec is a global registry, so select by name instead of by owner. */
const searchTerms = arg('--search', null)?.split(',').map((t) => t.trim()).filter(Boolean) ?? null

/** environdec drops connections under load; retry with backoff rather than losing records. */
const j = async (url, attempts = 4) => {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } })
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
      return await r.json()
    } catch (e) {
      lastErr = e
      await new Promise((res) => setTimeout(res, 400 * 2 ** i))
    }
  }
  throw new Error(`${lastErr?.message} for ${url}`)
}

const txt = (arr, lang = 'en') =>
  (arr ?? []).find((x) => x.lang === lang)?.value ?? (arr ?? [])[0]?.value ?? null

/** Walk the whole datastock. The name search is literal substring matching, so never rely on it. */
async function listAll() {
  const out = []
  for (let start = 0; ; start += 1000) {
    const page = await j(
      `${BASE}/datastocks/${DATASTOCK}/processes?search=true&distributed=false&format=json&pageSize=1000&startIndex=${start}`
    )
    out.push(...page.data)
    if (out.length >= page.totalCount || page.data.length === 0) break
  }
  return out
}

/**
 * Name search is literal substring matching with no synonym handling, on both nodes. Never rely
 * on a single term: on ÖKOBAUDAT "Bewehrungsstahl" returns 2 hits and "Betonstahl" returns 10 for
 * the same product class.
 */
async function listBySearch(terms) {
  const seen = new Map()
  for (const t of terms) {
    const page = await j(
      `${BASE}/datastocks/${DATASTOCK}/processes?search=true&distributed=false&format=json&pageSize=200&name=${encodeURIComponent(t)}`
    )
    for (const d of page.data ?? []) seen.set(d.uuid, d)
    console.log(`    "${t}" → ${page.totalCount ?? 0} hits`)
  }
  return [...seen.values()]
}

/** Pull GWP-biogenic per module out of the LCIA block. */
function gwpBiogenic(process) {
  const results = process.LCIAResults?.LCIAResult ?? []
  const hit = results.find((r) =>
    (txt(r.referenceToLCIAMethodDataSet?.shortDescription) ?? '').toLowerCase().includes('biogenic')
  )
  if (!hit) return null
  const modules = {}
  for (const a of hit.other?.anies ?? []) {
    if (!a.module || a.value === undefined) continue
    // Ignore end-of-life and scenario rows: the method sums A1..A5 only. C3 carries the
    // EN15804 '-1/+1' reversal and would cancel the storage entirely if included.
    const key = a.module === 'A1-A3' ? 'A1A3' : a.module
    if (!/^(A1A3|A1|A2|A3|A4|A5)$/.test(key)) continue
    // A5 appears with a scenario ("Entsorgung Verpackung"); keep the first, record the scenario.
    if (modules[key] === undefined) modules[key] = Number(a.value)
  }
  return modules
}

/** The declared unit and the biogenic carbon content live on the FLOW, not the process. */
async function referenceFlow(process) {
  const ref = process.exchanges?.exchange?.[0]?.referenceToFlowDataSet
  if (!ref?.refObjectId) return {}
  const flow = await j(`${BASE}/flows/${ref.refObjectId}?format=json&view=extended`)
  const props = {}
  for (const p of flow.flowProperties?.flowProperty ?? []) {
    const name = txt(p.referenceToFlowPropertyDataSet?.shortDescription) ?? ''
    props[name] = p.meanValue
  }
  const unit =
    props.Volume !== undefined ? 'm3'
    : props.Area !== undefined ? 'm2'
    : props.Length !== undefined ? 'm'
    : props.Mass !== undefined ? 'kg'
    : null
  return {
    declaredUnit: unit,
    declaredAmount: props.Volume ?? props.Area ?? props.Length ?? props.Mass ?? null,
    massKg: props.Mass ?? null,
    cBioKg: props['Carbon content (biogenic)'] ?? null,
    cBioPackagingKg: props['Carbon content (biogenic) - packaging'] ?? null,
  }
}

async function main() {
  console.log(`Node: ${NODE.label}`)
  console.log(`Terms: ${NODE.terms}\n`)
  const all = searchTerms ? await listBySearch(searchTerms) : await listAll()
  console.log(`  ${all.length} datasets ${searchTerms ? 'matched' : 'in stock'}`)

  const candidates = all.filter((d) => {
    if (ownerFilter && !(d.owner ?? '').includes(ownerFilter)) return false
    const compliant = (d.compliance ?? []).some((c) => A2_COMPLIANCE.has(c.uuid ?? c))
    if (!compliant) return false
    // keep only the newest vintage per product name
    return true
  })

  // Deduplicate by name, keeping the highest refYear — ÖKOBAUDAT serves expired vintages as live.
  const byName = new Map()
  for (const d of candidates) {
    const prev = byName.get(d.name)
    if (!prev || (d.refYear ?? 0) > (prev.refYear ?? 0)) byName.set(d.name, d)
  }
  const selected = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
  console.log(`  ${candidates.length} match owner+A2, ${selected.length} after keeping newest vintage\n`)

  const records = []
  for (const [i, d] of selected.entries()) {
    process.stdout.write(`  [${i + 1}/${selected.length}] ${d.name.slice(0, 48).padEnd(50)}\r`)
    try {
      const p = await j(`${BASE}/processes/${d.uuid}?format=json&view=extended`)
      const flow = await referenceFlow(p)
      const modules = gwpBiogenic(p)

      const rec = {
        uuid: d.uuid,
        version: d.version,
        name: txt(p.processInformation?.dataSetInformation?.name?.baseName, 'de') ?? d.name,
        nameEn: txt(p.processInformation?.dataSetInformation?.name?.baseName, 'en'),
        owner: d.owner,
        subType: d.subType,
        regNo: d.regNo || null,
        refYear: d.refYear,
        validUntil: d.validUntil,
        ...flow,
        gwpBiogenic: modules,
        modulesPresent: modules ? Object.keys(modules).sort().join('+') : null,
        source: NODE.label,
        sourceUrl: `${BASE}/processes/${d.uuid}?format=html`,
        retrieved: new Date().toISOString().slice(0, 10),
      }

      // Both variants, so the divergence is visible instead of assumed.
      rec.variant4ii = rec.cBioKg != null ? rec.cBioKg * CO2_PER_C : null
      const row = computeRow(
        {
          name: rec.name,
          quantity: 1,
          epd: {
            registration: rec.regNo ?? '',
            standard: 'EN15804+A2',
            datasetType: rec.subType === 'specific dataset' ? 'specific' : 'representative',
            validUntil: `${rec.validUntil}-12-31`,
          },
          rslYears: null,
          rslSource: 'unknown',
          gwpBiogenic: modules ?? undefined,
          cBioPerUnit: rec.cBioKg ?? undefined,
        },
        { ruleset: 'CSC-2026-02' }
      )
      rec.variant4iii = row.computed['4.iii'] ?? null
      rec.divergencePct =
        rec.variant4ii && rec.variant4iii ? ((rec.variant4iii - rec.variant4ii) / rec.variant4ii) * 100 : null
      rec.status = row.status
      rec.blocking = row.blocking
      records.push(rec)
    } catch (e) {
      console.error(`\n  ! ${d.name}: ${e.message}`)
    }
  }
  process.stdout.write(' '.repeat(70) + '\r')

  await mkdir(new URL('../data/', import.meta.url), { recursive: true })
  const slug = (ownerFilter ?? (searchTerms ? 'search' : 'all'))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
  const outfile = new URL(`../data/${nodeName}-${slug}.json`, import.meta.url)
  await writeFile(outfile, JSON.stringify(records, null, 2))

  /* ---- what the data actually says --------------------------------------- */
  const n = records.length
  const has = (f) => records.filter(f).length
  console.log(`${n} records → ${outfile.pathname.split('/').slice(-2).join('/')}\n`)
  console.log(`  biogenic carbon in kg C (Variant 4.ii usable)   ${has((r) => r.cBioKg != null)}/${n}`)
  console.log(`  packaging carbon declared separately            ${has((r) => r.cBioPackagingKg != null)}/${n}`)
  console.log(`  A4 declared                                     ${has((r) => r.gwpBiogenic?.A4 !== undefined)}/${n}`)
  console.log(`  A5 declared                                     ${has((r) => r.gwpBiogenic?.A5 !== undefined)}/${n}`)
  console.log(`  full A1–A5 (Variant 4.iii usable)               ${has((r) => r.variant4iii != null)}/${n}`)
  console.log(`  registration number (needed for Tabel 2)        ${has((r) => r.regNo)}/${n}`)
  console.log(`  reaching status 'bepaald'                       ${has((r) => r.status === 'bepaald')}/${n}`)

  const div = records.filter((r) => r.divergencePct != null)
  if (div.length) {
    const abs = div.map((r) => Math.abs(r.divergencePct)).sort((a, b) => a - b)
    console.log(
      `\n  4.ii vs 4.iii on ${div.length} records: median ${abs[abs.length >> 1].toFixed(3)}%, max ${abs.at(-1).toFixed(3)}%`
    )
  }

  // Cross-check: does the declared kg C agree with the A1-A3 GWP-biogenic? This is not the
  // mandated variant, but it tells us whether the two independent routes describe the same
  // physical quantity — and therefore whether an A1-A3-only reading would be defensible.
  const cross = records
    .filter((r) => r.variant4ii != null && r.gwpBiogenic?.A1A3 != null)
    .map((r) => ({
      name: r.name,
      a1a3: -r.gwpBiogenic.A1A3,
      v4ii: r.variant4ii,
      pct: ((-r.gwpBiogenic.A1A3 - r.variant4ii) / r.variant4ii) * 100,
    }))
  if (cross.length) {
    const abs = cross.map((c) => Math.abs(c.pct)).sort((a, b) => a - b)
    console.log(
      `\n  declared kg C vs −(A1–A3) on ${cross.length} records: median ${abs[abs.length >> 1].toFixed(3)}%, max ${abs.at(-1).toFixed(3)}%`
    )
    for (const c of cross.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 3)) {
      console.log(
        `    ${c.name.slice(0, 42).padEnd(44)} ${c.v4ii.toFixed(2).padStart(9)} vs ${c.a1a3.toFixed(2).padStart(9)}  ${c.pct >= 0 ? '+' : ''}${c.pct.toFixed(3)}%`
      )
    }
  }

  const blockers = {}
  for (const r of records) for (const b of r.blocking ?? []) blockers[b] = (blockers[b] ?? 0) + 1
  console.log('\n  blocking reasons:')
  for (const [k, v] of Object.entries(blockers).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${v.toString().padStart(3)}  ${k}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
