'use strict'

const { test } = require('brittle')
const alerts = require('../../workers/lib/alerts')
const libUtils = require('@tetherto/miningos-tpl-wrk-miner/workers/lib/utils')

// The alert `valid` guards all share the same shape:
// isValidSnap(snap) && !isOffline(snap) && ctx.conf[name] && <temp array>.length > 0.
// Force the util predicates so we exercise each spec's own guard branch.
function withValidSnap (fn) {
  const originalIsValidSnap = libUtils.isValidSnap
  const originalIsOffline = libUtils.isOffline
  libUtils.isValidSnap = () => true
  libUtils.isOffline = () => false
  try {
    fn()
  } finally {
    libUtils.isValidSnap = originalIsValidSnap
    libUtils.isOffline = originalIsOffline
  }
}

const snapWithTemps = () => ({
  stats: {
    temperature_c: {
      temp: [{ pcbInlet: 40, pcbOutlet: 60 }],
      raw_temps: [{ pcb: 70 }]
    }
  }
})

const validCases = [
  ['max_pcb_temp_warning', { max_pcb_temp_warning: { params: { temp: 90 } } }],
  ['max_pcb_temp_critical', { max_pcb_temp_critical: { params: { temp: 100 } } }],
  ['max_inlet_temp_warning', { max_inlet_temp_warning: { params: { temp: 60 } } }],
  ['max_inlet_temp_critical', { max_inlet_temp_critical: { params: { temp: 80 } } }],
  ['min_inlet_temp_warning', { min_inlet_temp_warning: { params: { temp: 20 } } }],
  ['min_inlet_temp_critical', { min_inlet_temp_critical: { params: { temp: 10 } } }]
]

for (const [name, conf] of validCases) {
  test(`${name} - valid returns true for a populated snap`, (t) => {
    withValidSnap(() => {
      const result = alerts.specs.miner[name].valid({ conf }, snapWithTemps())
      t.is(result, true)
    })
  })

  test(`${name} - valid returns false when no temperature samples`, (t) => {
    withValidSnap(() => {
      const emptySnap = { stats: { temperature_c: { temp: [], raw_temps: [] } } }
      const result = alerts.specs.miner[name].valid({ conf }, emptySnap)
      t.absent(result)
    })
  })
}
