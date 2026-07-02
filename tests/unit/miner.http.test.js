'use strict'

const { test } = require('brittle')
const crypto = require('crypto')
const Miner = require('../../workers/lib/miner')

const password = crypto.randomBytes(5).toString('base64').replace(/[^a-z0-9]/gi, '').slice(0, 5)

// Build a miner whose HTTP client is a controllable stub. The constructor kicks
// off an async _setupClient(); we await it so its deferred assignment cannot
// clobber the stub we install afterwards.
async function makeMiner (fetchImpl, extraOpts = {}) {
  const miner = new Miner({
    timeout: 30000,
    address: '127.0.0.1',
    port: 80,
    username: 'admin',
    password,
    id: '001',
    ...extraOpts
  })
  await miner._setupClient()
  miner.client = { fetch: fetchImpl }
  return miner
}

const okJson = (payload) => async () => ({ ok: true, json: async () => payload })
const throwing = async () => { throw new Error('boom') }

test('getDeviceConfiguration - parses miner conf on success', async (t) => {
  const miner = await makeMiner(okJson({
    'api-listen': true,
    'api-network': false,
    'api-groups': 'A',
    'api-allow': 'W:0/0',
    'bitmain-fan-ctrl': false,
    'bitmain-fan-pwm': '80',
    'bitmain-use-vil': true,
    'bitmain-freq': '525',
    'bitmain-voltage': '1300',
    'bitmain-ccdelay': '0',
    'bitmain-work-mode': '0',
    'bitmain-freq-level': '100'
  }))

  const res = await miner.getDeviceConfiguration()
  t.is(res.success, true)
  t.is(res.api_enabled, true)
  t.is(res.fan_speed, 80)
  t.is(res.frequency, 525)
  t.is(res.work_mode, 0)
})

test('getDeviceConfiguration - returns error on failure', async (t) => {
  const miner = await makeMiner(throwing)
  const res = await miner.getDeviceConfiguration()
  t.is(res.success, false)
  t.is(res.error, 'boom')
})

test('_getMinerConf - normalizes pools and mode fields', async (t) => {
  const miner = await makeMiner(okJson({
    pools: [{ url: 'a' }],
    'bitmain-fan-ctrl': true,
    'bitmain-fan-pwm': '90',
    'bitmain-work-mode': '1',
    'bitmain-freq-level': '90'
  }))

  const res = await miner._getMinerConf()
  t.alike(res.pools, [{ url: 'a' }])
  t.is(res['miner-mode'], '1')
  t.is(res['freq-level'], '90')
})

test('_getMinerConf - defaults pools to [] and reports error', async (t) => {
  const miner = await makeMiner(throwing)
  const res = await miner._getMinerConf()
  t.is(res.success, false)
  t.is(res.error, 'boom')
})

test('getFrequency - returns parsed frequency', async (t) => {
  const miner = await makeMiner(okJson({ 'bitmain-freq': '512.5' }))
  t.is(await miner.getFrequency(), 512.5)
})

test('getFrequency - returns 0.0 on error', async (t) => {
  const miner = await makeMiner(throwing)
  t.is(await miner.getFrequency(), 0.0)
})

test('setFan - returns success when request ok', async (t) => {
  const miner = await makeMiner(okJson({ pools: [] }))
  const res = await miner.setFan(false)
  t.is(res.success, true)
})

test('setFan - returns error when fetch throws', async (t) => {
  const miner = await makeMiner(throwing)
  const res = await miner.setFan(true)
  t.is(res.success, false)
  t.is(res.error, 'boom')
})

test('setFanSpeed - returns success when request ok', async (t) => {
  const miner = await makeMiner(okJson({ pools: [] }))
  const res = await miner.setFanSpeed(70)
  t.is(res.success, true)
})

test('setFanSpeed - returns error when fetch throws', async (t) => {
  const miner = await makeMiner(throwing)
  const res = await miner.setFanSpeed(70)
  t.is(res.success, false)
})

test('getPowerValue - parses power for supported miner type', async (t) => {
  const miner = await makeMiner(async () => ({ text: async () => 'power:1500' }), { type: 's21' })
  const res = await miner.getPowerValue()
  t.is(res.success, true)
  t.is(res.power, 1500)
})

test('getPowerValue - returns undefined power for unsupported type', async (t) => {
  const miner = await makeMiner(throwing, { type: 's19xp' })
  const res = await miner.getPowerValue()
  t.is(res.success, true)
  t.is(res.power, undefined)
})

test('getPowerValue - returns error when fetch throws for supported type', async (t) => {
  const miner = await makeMiner(throwing, { type: 's21pro' })
  const res = await miner.getPowerValue()
  t.is(res.success, false)
  t.is(res.error, 'boom')
})

test('getNetworkInformation - maps DHCP response', async (t) => {
  const miner = await makeMiner(okJson({
    nettype: 'DHCP',
    ipaddress: '10.0.0.2',
    macaddr: 'aa:bb',
    conf_hostname: 'miner',
    netmask: '255.255.255.0'
  }))
  const res = await miner.getNetworkInformation()
  t.is(res.success, true)
  t.is(res.type, 'dhcp')
  t.is(res.network.ip, '10.0.0.2')
  t.is(res.network.gateway, undefined)
})

test('getNetworkInformation - maps static response', async (t) => {
  const miner = await makeMiner(okJson({
    nettype: 'Static',
    ipaddress: '10.0.0.3',
    macaddr: 'aa:cc',
    conf_hostname: 'miner2',
    netmask: '255.255.255.0',
    conf_gateway: '10.0.0.1',
    conf_dnsservers: '8.8.8.8,1.1.1.1'
  }))
  const res = await miner.getNetworkInformation()
  t.is(res.type, 'static')
  t.is(res.network.gateway, '10.0.0.1')
  t.alike(res.network.dns, ['8.8.8.8', '1.1.1.1'])
})

test('getNetworkInformation - returns error on failure', async (t) => {
  const miner = await makeMiner(throwing)
  const res = await miner.getNetworkInformation()
  t.is(res.success, false)
})

test('setNetworkInformation - sends static settings', async (t) => {
  const miner = await makeMiner(okJson({}))
  const res = await miner.setNetworkInformation({
    type: 'static',
    network: { hostname: 'h', ip: '10.0.0.4', mask: '255.255.255.0', gateway: '10.0.0.1', dns: ['8.8.8.8'] }
  })
  t.is(res.success, true)
})

test('setNetworkInformation - sends dhcp settings', async (t) => {
  const miner = await makeMiner(okJson({}))
  const res = await miner.setNetworkInformation({ type: 'dhcp', network: { hostname: 'h' } })
  t.is(res.success, true)
})

test('setNetworkInformation - returns error when fetch throws', async (t) => {
  const miner = await makeMiner(throwing)
  const res = await miner.setNetworkInformation({ type: 'dhcp', network: { hostname: 'h' } })
  t.is(res.success, false)
})

test('setPools - skips when prepared pools are unchanged', async (t) => {
  const miner = await makeMiner(okJson({ pools: [] }))
  miner.getPools = async () => []
  miner._prepPools = () => false
  const res = await miner.setPools([{ url: 'u' }])
  t.is(res.success, true)
  t.is(res.message, 'Pools are same, skipping')
})

test('setPools - throws on non-array prepared pools', async (t) => {
  const miner = await makeMiner(okJson({ pools: [] }))
  miner.getPools = async () => []
  miner._prepPools = () => 'not-an-array'
  const res = await miner.setPools([{ url: 'u' }])
  t.is(res.success, false)
  t.is(res.error, 'ERR_INVALID_POOLS')
})

test('setPools - writes prepared pools and reboots on success', async (t) => {
  let rebooted = false
  const miner = await makeMiner(okJson({ pools: [] }))
  miner.getPools = async () => []
  miner._prepPools = () => [{ url: 'u', worker_name: 'w', worker_password: 'p' }]
  miner.reboot = () => { rebooted = true; return { success: true } }
  const res = await miner.setPools([{ url: 'u' }])
  t.is(res.success, true)
  t.is(rebooted, true)
})

test('setFrequency - returns success when request ok', async (t) => {
  const miner = await makeMiner(okJson({ pools: [] }))
  const res = await miner.setFrequency(550)
  t.is(res.success, true)
})

test('setFrequency - returns error when fetch throws', async (t) => {
  const miner = await makeMiner(throwing)
  const res = await miner.setFrequency(550)
  t.is(res.success, false)
})

test('setLED - returns error when fetch throws', async (t) => {
  const miner = await makeMiner(throwing)
  const res = await miner.setLED(true)
  t.is(res.success, false)
  t.is(res.error, 'boom')
})

test('getLED - returns parsed status', async (t) => {
  const miner = await makeMiner(okJson({ blink: true }))
  const res = await miner.getLED()
  t.is(res.blink, true)
})

test('getLED - returns error when fetch throws', async (t) => {
  const miner = await makeMiner(throwing)
  const res = await miner.getLED()
  t.is(res.success, false)
})

test('updateFirmware - is not implemented', async (t) => {
  const miner = await makeMiner(okJson({}))
  await t.exception(() => miner.updateFirmware(), /ERR_NOT_IMPL/)
})

test('updateAdminPassword - updates password on P000', async (t) => {
  const miner = await makeMiner(okJson({ code: 'P000' }))
  const res = await miner.updateAdminPassword('newpass')
  t.is(res.success, true)
  t.is(miner.opts.password, 'newpass')
})

test('updateAdminPassword - returns error code on failure', async (t) => {
  const miner = await makeMiner(okJson({ code: 'P999' }))
  const res = await miner.updateAdminPassword('newpass')
  t.is(res.success, false)
  t.is(res.error, 'P999')
})

test('updateAdminPassword - returns error when fetch throws', async (t) => {
  const miner = await makeMiner(throwing)
  const res = await miner.updateAdminPassword('newpass')
  t.is(res.success, false)
  t.is(res.error, 'boom')
})

test('setPowerMode - returns error for invalid mode', async (t) => {
  const miner = await makeMiner(okJson({ pools: [] }))
  const res = await miner.setPowerMode('turbo')
  t.is(res.success, false)
})

test('reboot - returns success and swallows fetch errors', async (t) => {
  const miner = await makeMiner(throwing)
  const res = miner.reboot()
  t.is(res.success, true)
})

test('getVersion - returns error on failure', async (t) => {
  const miner = await makeMiner(throwing)
  const res = await miner.getVersion()
  t.is(res.success, false)
})

test('getSummary - returns zeroed data on failure', async (t) => {
  const miner = await makeMiner(throwing)
  const res = await miner.getSummary()
  t.is(res.success, false)
  t.is(res.mhs_av, 0)
})

test('getMinerStats - returns fallback boards on failure', async (t) => {
  const miner = await makeMiner(throwing)
  const res = await miner.getMinerStats()
  t.is(res.success, false)
  t.is(res.boards.length, 3)
})

test('getPools - returns empty list on failure', async (t) => {
  const miner = await makeMiner(throwing)
  t.alike(await miner.getPools(), [])
})
