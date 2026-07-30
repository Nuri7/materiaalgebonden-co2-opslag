import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runConformance } from '../src/conformance.js'

test('every published conformance case passes', () => {
  const results = runConformance()
  const failed = results.filter((r) => !r.pass)
  for (const f of failed) {
    console.error(`FAIL ${f.id}`, f.error ?? f.checks.filter((c) => !c.pass))
  }
  assert.equal(failed.length, 0, `${failed.length} of ${results.length} cases failed`)
})
