#!/usr/bin/env node
// analyze-subagent-transcripts.mjs — deterministic diagnostics for pi workflow runs.
//
// Usage:
//   node scripts/analyze-subagent-transcripts.mjs [sessionsDir] [--days N] [--top N]
//        [--last-n N] [--range A..B]
//
// --last-n N    process the N most recent workflow runs (newest first). Default: all found.
// --range A..B  slice the newest-first run list ordinally (1-based, inclusive), e.g. --range 2..4
//               processes the 2nd through 4th most recent runs. Applied after --last-n.
//
// A "workflow run" = one `wf_*.workflow.jsonl` journal under /tmp/pi-subagents-1000/**/tasks/;
// its sub-agent children = sidechain session files created within (prev run end, this run end].
// Role per child is classified from the first user prompt (implementer / verifier / status /
// load / primer / final / escalate / selffix / reverify / discovery / gate / reviewer / compose /
// snapshot / resolve / other).
//
// Reports per workflow: children, total/avg/min/max/median tokens, per-role breakdown.
// Aggregates per role across runs and overall totals.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const argv = process.argv.slice(2)
let dir = null
let days = 14
let lastN = Infinity
let rangeA = null
let rangeB = null
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--days') days = Number(argv[++i]) || 14
  else if (argv[i] === '--last-n') lastN = Number(argv[++i]) || Infinity
  else if (argv[i] === '--range') {
    const m = String(argv[++i]).split('..')
    rangeA = Number(m[0]) || null
    rangeB = m.length > 1 ? Number(m[1]) || rangeA : rangeA
  } else dir = argv[i]
}
if (!dir) {
  const base = join(process.env.HOME || '', '.pi/agent/sessions')
  const slug = '--' + process.cwd().replaceAll('/', '-') + '-'
  dir = join(base, slug)
  try {
    if (!statSync(dir).isDirectory()) throw new Error('missing')
  } catch {
    // fall back to the project dir with the most recently modified .jsonl
    let best = null; let bestM = -1
    for (const e of readdirSync(base, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      const d = join(base, e.name)
      let m = -1
      try { for (const f of readdirSync(d)) { if (f.endsWith('.jsonl')) m = Math.max(m, statSync(join(d, f)).mtimeMs) } } catch {}
      if (m > bestM) { bestM = m; best = d }
    }
    if (best) dir = best
  }
}
const tmpRoot = join(process.env.TMPDIR || '/tmp', 'pi-subagents-1000')

// ── collect workflow run journals (newest first) ────────────────────────────
function findJournals(root, out) {
  let entries
  try { entries = readdirSync(root, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const p = join(root, e.name)
    if (e.isDirectory()) findJournals(p, out)
    else if (e.name.endsWith('.workflow.jsonl')) out.push({ path: p, mtime: statSync(p).mtimeMs, id: e.name.replace(/\.workflow\.jsonl$/, '') })
  }
}
const journals = []
findJournals(tmpRoot, journals)
journals.sort((a, b) => b.mtime - a.mtime)
let selected = journals.filter(j => Date.now() - j.mtime <= days * 86400_000)
selected = selected.slice(0, lastN === Infinity ? selected.length : lastN)
if (rangeA !== null) {
  const a = Math.max(1, rangeA)
  const b = Math.min(selected.length, rangeB || rangeA)
  selected = selected.slice(a - 1, b)
}

// ── collect sidechain child sessions ────────────────────────────────────────
const children = []
for (const f of readdirSync(dir)) {
  if (!f.endsWith('.jsonl')) continue
  const p = join(dir, f)
  const child = { path: p, name: f, created: 0, tokens: 0, calls: {}, prompts: [], resultBytes: 0 }
  const m = f.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/)
  if (m) child.created = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`)
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let r
    try { r = JSON.parse(line) } catch { continue }
    if (!child.isChild) child.isChild = !!r.isSidechain || !!r.parentSession
    if (!child.isChild) continue
    const msg = r.message || {}
    if (msg.role === 'user') {
      const c = msg.content
      const t = typeof c === 'string' ? c : (Array.isArray(c) ? c.map(x => (x && x.text) || '').join(' ') : '')
      if (t.trim()) child.prompts.push(t)
    }
    if (msg.role === 'assistant') {
      const u = msg.usage || {}
      child.tokens += u.totalTokens || 0
      for (const c of Array.isArray(msg.content) ? msg.content : []) {
        if (c && c.type === 'toolCall') child.calls[c.name] = (child.calls[c.name] || 0) + 1
      }
    }
    if (msg.role === 'toolResult') {
      const c = msg.content
      const t = typeof c === 'string' ? c : (Array.isArray(c) ? c.map(x => (x && x.text) || '').join(' ') : '')
      child.resultBytes += t.length
    }
  }
  if (child.prompts.length || child.tokens) children.push(child)
}

function classify(prompts) {
  // Classify on the FIRST prompt only: children are dispatched with their role in prompt 1.
  // Main-session files quote workflow phrases in later prompts — first-prompt gating excludes them.
  const first = prompts[0] || ''
  let role = 'other'
  if (/Assigned task:/.test(first)) role = 'implementer'
  else if (/Verify task /.test(first)) role = 'verifier'
  else if (/Re-run: .*instructions apply/.test(first)) role = 'status'
  else if (/Final apply state/.test(first)) role = 'final'
  else if (/Load the apply state/.test(first)) role = 'load'
  else if (/Produce the CONTEXT PRIMER/.test(first)) role = 'primer'
  else if (/escalation channel for a blocked/.test(first)) role = 'escalate'
  else if (/retry-pause\+discovery|Reply with exactly: paused/.test(first)) role = 'pause-discovery'
  else if (/Run the strict CLI gate/.test(first)) role = 'gate'
  else if (/read-only reviewer dimension/.test(first)) role = 'reviewer'
  else if (/composing a validation scorecard/.test(first)) role = 'compose'
  else if (/Snapshot the OpenSpec change/.test(first)) role = 'snapshot'
  else if (/resolve the artifact graph/.test(first)) role = 'resolve'
  // Same-family refinements may consult later prompts (resume/self-fix rounds).
  const joined = prompts.join(' | ')
  if (role === 'implementer' && /UNANSWERED/.test(joined)) role = 'implementer-selffix'
  if (role === 'verifier' && /Re-verify task/.test(joined)) role = 'verifier-reverify'
  return role
}

// ── assign children to runs by time window ──────────────────────────────────
const runs = selected.map((j, i) => ({ ...j, end: j.mtime, start: i + 1 < selected.length ? selected[i + 1].mtime : 0, children: [] }))
const excludedInteractive = []
for (const child of children) {
  // Only sessions with a known workflow prompt signature count as workflow children —
  // main-session files chain via parentSession too and would otherwise pollute run windows.
  if (classify(child.prompts) === 'other') { excludedInteractive.push(child); continue }
  const run = runs.find(r => child.created <= r.end + 60000 && (!r.start || child.created > r.start - 60000)) || runs[runs.length - 1]
  if (run && child.created <= run.end + 60000) run.children.push(child)
}

// ── stats helpers ───────────────────────────────────────────────────────────
const median = arr => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
const fmt = n => Math.round(n).toLocaleString('en-US')
const statsLine = (label, arr) => `${label}: total ${fmt(arr.reduce((a, b) => a + b, 0))} | avg ${fmt(avg(arr))} | min ${fmt(Math.min(...arr))} | max ${fmt(Math.max(...arr))} | median ${fmt(median(arr))}`

function roleOf(child) { return classify(child.prompts) }

// ── per-workflow section ────────────────────────────────────────────────────
const out = []
out.push(`# Workflow run diagnostics — ${runs.length} run(s) (of ${journals.length} journals, last ${days}d)`)
out.push(`# children classified: ${children.length} (workflow-signatured: ${children.length - excludedInteractive.length}; interactive/main excluded: ${excludedInteractive.length})`)

const roleAgg = {}
let grandTotal = 0
let grandChildren = 0

for (const run of runs) {
  const toks = run.children.map(c => c.tokens)
  grandTotal += toks.reduce((a, b) => a + b, 0)
  grandChildren += toks.length
  out.push(`\n## Run ${run.id.slice(0, 18)} — ${new Date(run.end).toISOString().slice(0, 16)} — ${run.children.length} children, ${fmt(toks.reduce((a, b) => a + b, 0))} tokens`)
  if (!toks.length) { out.push('  (no sidechain children found in window)'); continue }
  out.push('  ' + statsLine('tokens/child', toks))
  const byRole = {}
  for (const c of run.children) {
    const role = roleOf(c)
    byRole[role] = byRole[role] || []
    byRole[role].push(c.tokens)
    roleAgg[role] = roleAgg[role] || []
    roleAgg[role].push(c.tokens)
  }
  for (const [role, arr] of Object.entries(byRole).sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0))) {
    out.push(`    ${role.padEnd(22)} n=${String(arr.length).padStart(3)}  ${statsLine('', arr)}`)
  }
}

// ── per-role aggregate section ──────────────────────────────────────────────
out.push(`\n## Per-role aggregates (across ${runs.length} run(s))`)
for (const [role, arr] of Object.entries(roleAgg).sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0))) {
  out.push(`  ${role.padEnd(22)} n=${String(arr.length).padStart(3)}  ${statsLine('tokens', arr)}`)
}

// ── overall section ─────────────────────────────────────────────────────────
const runTotals = runs.map(r => r.children.reduce((a, c) => a + c.tokens, 0))
out.push(`\n## Overall`)
if (runTotals.length) out.push('  ' + statsLine('tokens/run', runTotals))
if (grandChildren) {
  const allChildToks = runs.flatMap(r => r.children.map(c => c.tokens))
  out.push('  ' + statsLine('tokens/child (all)', allChildToks))
  out.push(`  grand total: ${fmt(grandTotal)} tokens across ${grandChildren} children in ${runs.length} run(s)`)
} else {
  out.push('  (no children matched — nothing to total)')
}

// ── legacy sections (kept for continuity) ───────────────────────────────────
const agg = {}
for (const c of children) for (const [k, v] of Object.entries(c.calls)) agg[k] = (agg[k] || 0) + v
out.push(`\n## Aggregate tool distribution (sidechain children)`)
for (const [k, v] of Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 15)) out.push(`  ${String(v).padStart(6)}  ${k}`)
const ctxAdopt = children.filter(c => Object.keys(c.calls).some(k => k.startsWith('ctx_'))).length
out.push(`\n## ctx_* adoption: ${ctxAdopt}/${children.length} children used any ctx_* tool`)

console.log(out.join('\n'))