#!/usr/bin/env node
// analyze-subagent-transcripts.mjs — deterministic transcript diagnostics for pi session files.
//
// Usage:
//   node scripts/analyze-subagent-transcripts.mjs [sessionsDir] [--days N] [--top N]
//
// Defaults: sessionsDir = ~/.pi/agent/sessions/<--cwd-slug--> when run from a project, else ~/.pi/agent/sessions;
// days = 7; top = 10.
// Reports: aggregate tool distribution, per-session token totals, context hogs (largest tool results),
// loop detection (identical tool+args repeats), and ctx_* adoption (lean-ctx discipline check).

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'

const argv = process.argv.slice(2)
let dir = null
let days = 7
let top = 10
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--days') days = Number(argv[++i]) || 7
  else if (argv[i] === '--top') top = Number(argv[++i]) || 10
  else dir = argv[i]
}
if (!dir) {
  const slug = '--' + process.cwd().replaceAll('/', '-') + '-'
  dir = join(process.env.HOME || '', '.pi/agent/sessions', slug)
}
const cutoff = Date.now() - days * 86400_000

const sessions = []
for (const f of readdirSync(dir)) {
  if (!f.endsWith('.jsonl')) continue
  const p = join(dir, f)
  if (statSync(p).mtimeMs < cutoff) continue
  sessions.push(parseSession(p))
}

function parseSession(path) {
  const s = { path, name: basename(path), calls: {}, tokens: 0, turns: 0, results: [], firstPrompt: '', sidechain: false }
  let seenResultBytes = 0
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let r
    try { r = JSON.parse(line) } catch { continue }
    if (r.isSidechain) s.sidechain = true
    const m = r.message || {}
    if (m.role === 'user' && !s.firstPrompt) {
      const c = m.content
      const t = typeof c === 'string' ? c : (Array.isArray(c) ? c.map(x => (x && x.text) || '').join(' ') : '')
      s.firstPrompt = t.slice(0, 90).replace(/\s+/g, ' ')
    }
    if (m.role === 'assistant') {
      s.turns++
      const u = m.usage || {}
      s.tokens += u.totalTokens || 0
      for (const c of Array.isArray(m.content) ? m.content : []) {
        if (c && c.type === 'toolCall') {
          const key = c.name
          s.calls[key] = (s.calls[key] || 0) + 1
          const sig = key + ' ' + JSON.stringify(c.arguments || {})
          s.results.push({ kind: 'call', key: sig.slice(0, 160), bytes: sig.length })
        }
      }
    }
    if (m.role === 'toolResult') {
      let txt = ''
      const c = m.content
      if (typeof c === 'string') txt = c
      else if (Array.isArray(c)) txt = c.map(x => (x && x.text) || '').join('\n')
      seenResultBytes += txt.length
      s.results.push({ kind: 'RESULT ' + (m.toolName || '?') + (m.isError ? ' [ERROR]' : ''), bytes: txt.length, excerpt: txt.slice(0, 90).replace(/\s+/g, ' ') })
    }
  }
  s.resultBytes = seenResultBytes
  s.totalCalls = Object.values(s.calls).reduce((a, b) => a + b, 0)
  s.ctxCalls = Object.entries(s.calls).filter(([k]) => k.startsWith('ctx_')).reduce((a, [, v]) => a + v, 0)
  s.nativeShell = (s.calls.bash || 0) + (s.calls.grep || 0) + (s.calls.read || 0)
  // loop detection: identical tool+args signature repeated >= 5 times
  const counts = {}
  const callSigs = s.results.filter(r => !r.kind.startsWith('RESULT'))
  for (const r of callSigs) counts[r.key] = (counts[r.key] || 0) + 1
  const worst = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  s.loop = worst && worst[1] >= 5 ? { signature: worst[0], count: worst[1] } : null
  return s
}

const agg = {}
let totTokens = 0
for (const s of sessions) for (const [k, v] of Object.entries(s.calls)) agg[k] = (agg[k] || 0) + v
for (const s of sessions) totTokens += s.tokens

const sortedSessions = sessions.slice().sort((a, b) => b.tokens - a.tokens)
const hogs = sessions
  .flatMap(s => s.results.filter(r => r.kind.startsWith('RESULT')).map(r => ({ session: s.name.slice(11, 24), ...r })))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, top)
const ctxAdopt = sessions.filter(s => s.ctxCalls > 0).length

console.log(`# Transcript diagnostics — ${sessions.length} session file(s) in last ${days}d (${dir})`)
console.log(`\n## Aggregate tool distribution (all sessions)`)
for (const [k, v] of Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(v).padStart(6)}  ${k}`)
console.log(`\n## Token totals: ${totTokens.toLocaleString()} (replay-inclusive) across ${sessions.length} files`)
console.log(`## ctx_* adoption: ${ctxAdopt}/${sessions.length} files used any ctx_* tool`)
console.log(`\n## Top ${top} sessions by reported tokens`)
for (const s of sortedSessions.slice(0, top)) {
  console.log(`  ${s.tokens.toLocaleString().padStart(11)}  calls=${String(s.totalCalls).padStart(4)}  resultBytes=${String(s.resultBytes).padStart(8)}  ${s.sidechain ? '[child] ' : '[main]  '}${s.firstPrompt}`)
  if (s.loop) console.log(`     LOOP x${s.loop.count}: ${s.loop.signature}`)
}
console.log(`\n## Top ${top} context hogs (largest tool results)`)
for (const h of hogs) console.log(`  ${String(h.bytes).padStart(8)} B  ${h.session}  ${h.kind}  ${(h.excerpt || '').slice(0, 80)}`)
console.log(`\n## Loops (identical tool+args >= 5x)`)
let any = false
for (const s of sessions) if (s.loop) { any = true; console.log(`  ${s.name.slice(11, 24)}  x${s.loop.count}  ${s.loop.signature}`) }
if (!any) console.log('  (none)')