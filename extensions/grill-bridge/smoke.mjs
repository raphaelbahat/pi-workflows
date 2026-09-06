// Smoke test for the grill-bridge extension — plain node, no pi process.
//
// Scenarios:
//   1. hosted relay: an agent-session instance calls ask_user; the host
//      instance answers via mocked ctx.ui dialogs -> status ok + answers.
//   2. local host: the host instance's own model calls ask_user -> answered
//      directly, no bus round-trip.
//   3. no host: a fresh process scope without a claim -> status no-host
//      (the needs_input fallback contract).
//
// Run: node extensions/grill-bridge/smoke.mjs

import { EventEmitter } from 'node:events'
import assert from 'node:assert/strict'

const { default: createBridge } = await import('./index.js')

function makePi(bus) {
  const handlers = new Map()
  const tools = new Map()
  return {
    events: bus,
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event).push(handler)
    },
    registerTool(def) {
      tools.set(def.name, def)
    },
    __handlers: handlers,
    __tools: tools,
  }
}

function fire(pi, event, ...args) {
  for (const handler of pi.__handlers.get(event) ?? []) handler(...args)
}

function makeCtx(sessionFile, ui) {
  return {
    sessionManager: { getSessionFile: () => sessionFile },
    hasUI: true,
    ui,
  }
}

// Host-claim isolation across smoke runs: the extension stores the claim on
// Symbol.for — clean it between scenarios.
function resetClaim() {
  delete globalThis[Symbol.for('grill-bridge:host-claim')]
}

async function scenario1() {
  resetClaim()
  const bus = new EventEmitter()
  const hostPi = makePi(bus)
  const agentPi = makePi(bus)
  const answers = []
  const hostCtx = makeCtx('/tmp/sessions/host.jsonl', {
    select: async (title, options) => {
      answers.push(['select', title, options])
      return options[1]
    },
    input: async (title) => {
      answers.push(['input', title])
      return 'kebab-case everywhere'
    },
  })
  createBridge(hostPi)
  fire(hostPi, 'session_start', { reason: 'startup' }, hostCtx)

  createBridge(agentPi)
  const agentCtx = makeCtx('/tmp/sessions/agent-1.jsonl', {})
  fire(agentPi, 'session_start', { reason: 'startup' }, agentCtx)

  const tool = agentPi.__tools.get('ask_user')
  assert.ok(tool, 'ask_user registered in agent session')
  const result = await tool.execute('call-1', {
    questions: [
      { question: 'Naming convention?', options: ['camelCase', 'kebab-case'] },
      { question: 'Anything else to lock in?' },
    ],
  }, undefined, undefined, agentCtx)
  const payload = JSON.parse(result.content[0].text)
  assert.equal(payload.status, 'ok')
  assert.equal(payload.answers[0].answer, 'kebab-case')
  assert.equal(payload.answers[1].answer, 'kebab-case everywhere')
  assert.equal(answers.length, 2)
  console.log('scenario 1 (hosted relay) OK —', JSON.stringify(payload.answers))
}

async function scenario2() {
  resetClaim()
  const bus = new EventEmitter()
  const hostPi = makePi(bus)
  const hostCtx = makeCtx('/tmp/sessions/host.jsonl', {
    input: async () => 'yes, ship the fallback',
  })
  createBridge(hostPi)
  fire(hostPi, 'session_start', { reason: 'startup' }, hostCtx)

  const tool = hostPi.__tools.get('ask_user')
  const result = await tool.execute('call-2', {
    questions: [{ question: 'Keep the needs_input fallback?' }],
  }, undefined, undefined, hostCtx)
  const payload = JSON.parse(result.content[0].text)
  assert.equal(payload.status, 'ok')
  assert.equal(payload.answers[0].answer, 'yes, ship the fallback')
  console.log('scenario 2 (local host call) OK —', JSON.stringify(payload.answers))
}

async function scenario3() {
  resetClaim()
  const bus = new EventEmitter()
  const lonePi = makePi(bus)
  // A session that never claimed host (e.g. spawned headless): its
  // session_start runs, but another instance already released / none armed.
  const loneCtx = makeCtx('/tmp/sessions/lone.jsonl', {})
  createBridge(lonePi)
  fire(lonePi, 'session_start', { reason: 'startup' }, loneCtx)
  // Simulate the host going away without shutdown: drop the claim.
  delete globalThis[Symbol.for('grill-bridge:host-claim')]

  const tool = lonePi.__tools.get('ask_user')
  const result = await tool.execute('call-3', {
    questions: [{ question: 'Anyone there?' }],
  }, undefined, undefined, loneCtx)
  const payload = JSON.parse(result.content[0].text)
  assert.equal(payload.status, 'no-host')
  assert.match(payload.note, /needs_input/)
  console.log('scenario 3 (no-host fallback) OK —', payload.note)

  // Shutdown must not throw and must free listeners.
  fire(lonePi, 'session_shutdown', {}, loneCtx)
}

try {
  await scenario1()
  await scenario2()
  await scenario3()
  console.log('smoke: all scenarios passed')
} catch (err) {
  console.error('smoke FAILED:', err)
  process.exit(1)
}
