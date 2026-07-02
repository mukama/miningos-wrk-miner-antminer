'use strict'

const { getDefaultConf, testExecutor } = require('@tetherto/miningos-tpl-wrk-miner/tests/miner.test')
const Miner = require('../workers/lib/miner')
const srv = require('../mock/server')
const crypto = require('crypto')

let mockServer

const conf = getDefaultConf()
if (!conf.settings.live) {
  conf.settings.host = '127.0.0.1'
  conf.settings.password = crypto.randomBytes(5).toString('base64').replace(/[^a-z0-9]/gi, '').slice(0, 5)
  mockServer = srv.createServer({ host: conf.settings.host, port: conf.settings.port, type: 'S19xp', password: conf.settings.password })
}

const miner = new Miner({
  timeout: 100,
  address: conf.settings.host,
  port: conf.settings.port,
  username: conf.settings.username,
  password: conf.settings.password,
  id: '001'
})

conf.cleanup = async () => {
  try {
    if (mockServer) {
      await mockServer.exit()
    }
  } catch (e) {
    // Ignore errors during cleanup
  }
}

const execute = async () => {
  try {
    // Wait for the mock server to be listening before issuing requests,
    // otherwise the first request can race server startup (ECONNREFUSED).
    if (mockServer && mockServer.ready) {
      await mockServer.ready
    }
    await miner._setupClient()
    await testExecutor(miner, conf)
  } finally {
    // Ensure cleanup is called
    if (conf.cleanup) {
      await conf.cleanup()
    }
    // Give time for connections to close
    await new Promise(resolve => setTimeout(resolve, 2000))
    // `brittle --coverage` writes its report on the 'beforeExit' event, which
    // process.exit() skips. Flush those listeners so coverage-final.json is
    // produced (a 2-min setLED timer otherwise keeps the process from exiting
    // on its own).
    for (const listener of process.listeners('beforeExit')) {
      await listener(0)
    }
    process.exit(0)
  }
}

execute().catch(err => {
  console.error(err)
  process.exit(1)
})
