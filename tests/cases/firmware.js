'use strict'

// Antminer does not implement in-place firmware updates: `updateFirmware`
// is intentionally a stub that throws `ERR_NOT_IMPL`. The shared miner
// template ships a `updateFirmware` case that expects a successful result,
// so we override it here to assert the not-implemented contract instead.
// When firmware updates are implemented for Antminer, replace this with the
// template's `success_validate` expectation.
module.exports = () => ({
  updateFirmware: {
    stages: [
      {
        name: 'updateFirmware',
        ask: true,
        executor: async ({ dev }) => dev.updateFirmware(),
        validate: { type: 'exception' }
      }
    ]
  }
})
