export const meta = {
  name: 'openspec-apply-campaign',
  description:
    'Serially implement ALL unimplemented OpenSpec changes in the host-provided dependency order: per change, run openspec-apply-change (idempotent — checkboxes are the state); fail-soft per change (one blocked change does not stop the campaign). No commits, no archive — the host reviews, commits, and archives after the digest.',
  phases: [
    { title: 'Implement', detail: 'serial openspec-apply-change runs, dependency order, fail-soft' },
    { title: 'Digest', detail: 'per-change outcomes + host-only next steps' },
  ],
}

const A = (typeof args === 'string') ? JSON.parse(args) : (args || {})
const REPO = A.repoRoot || null
const ORDER = Array.isArray(A.changes) ? A.changes : []
if (!ORDER.length) throw new Error('args.changes must list the change names in dependency order')

// --- Phase: Implement -------------------------------------------------------
// Strictly serial: each change builds on the previous ones in the shared tree,
// and apply-change is idempotent (checkboxes are the state), so a re-run resumes.
phase('Implement')
const results = []
for (let i = 0; i < ORDER.length; i++) {
  const change = ORDER[i]
  log('[' + (i + 1) + '/' + ORDER.length + '] applying: ' + change)
  let r = null
  try {
    r = await workflow('openspec-apply-change', { change: change, repoRoot: REPO })
  } catch (e) {
    r = { change: change, error: 'workflow-threw', note: String((e && e.message) || e) }
  }
  const entry = {
    order: i + 1,
    change: change,
    state: r ? (r.state || (r.error ? 'error:' + r.error : 'unknown')) : 'no-result',
    tasks_done: r ? (r.tasks_done != null ? r.tasks_done : (r.progress ? r.progress.complete : null)) : null,
    tasks_total: r ? (r.tasks_total != null ? r.tasks_total : (r.progress ? r.progress.total : null)) : null,
    needs_input: r ? (r.needs_input || null) : null,
    blocked_task: r ? (r.blocked_task || null) : null,
    note: r ? (r.note || r.error || null) : 'no result returned',
  }
  results.push(entry)
  log('[' + (i + 1) + '/' + ORDER.length + '] ' + change + ' → ' + entry.state +
    (entry.tasks_done != null ? ' (' + entry.tasks_done + '/' + entry.tasks_total + ')' : ''))
}

// --- Phase: Digest ----------------------------------------------------------
phase('Digest')
const allDone = results.filter(function (r) { return r.state === 'all_done' })
const blocked = results.filter(function (r) { return r.needs_input })
const failed = results.filter(function (r) { return String(r.state).indexOf('error:') === 0 })
return {
  total: ORDER.length,
  all_done: allDone.map(function (r) { return r.change }),
  blocked: blocked.map(function (r) { return { change: r.change, blocked_task: r.blocked_task, needs_input: r.needs_input } }),
  failed: failed.map(function (r) { return { change: r.change, state: r.state, note: r.note } }),
  results: results,
  next: 'host-review-then-commit-and-archive (main-session-only per ADR-0001/0002)',
  note: 'No commits and no archive were performed by this workflow — the host reviews each change, commits, and runs openspec archive in the main session.',
}
