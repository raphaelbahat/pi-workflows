export const meta = {
  name: 'openspec-campaign',
  description:
    'Campaign orchestrator for N independent OpenSpec changes: discover items (args or openspec list), SERIAL openspec new change scaffolding (global-mutating verb, never parallelized), one-level-deep planning fan-out via workflow(\'openspec-plan-change\') per item (proposals-only by default), per-item outcome tracking (ok | needs_input | failed — no blanket retries), and a composer that folds shard records into CAMPAIGN.md. Never applies, archives, or updates — the host owns all approvals.',
  phases: [
    { title: 'Discover', detail: 'resolve items from args or openspec list' },
    { title: 'Scaffold', detail: 'serial openspec new change per item; failure never stops siblings' },
    { title: 'Plan', detail: 'one-level workflow() fan-out per item; proposals-only default' },
    { title: 'Compose', detail: 'shard records fold into CAMPAIGN.md at the repo root' },
  ],
}

const TOOL = [
  'TOOL DISCIPLINE: issue at most ONE tool call per message; never batch two or more tool calls in a single turn.',
  'If a tool call is rejected as malformed, silently re-issue that ONE call cleanly. Never restate or quote tool-call markup as text.',
  'End by calling StructuredOutput exactly once with the required object — do not answer in prose instead.',
].join('\n')

const CONTRACT = [
  'CAMPAIGN CONTRACT (verbatim prohibitions — contractual trust model, ADR-0001/ADR-0002):',
  '- You MUST NOT run `openspec apply`, `openspec archive`, `openspec update`, or ANY openspec verb that writes',
  '  change state beyond what your assigned step explicitly instructs.',
  '- Approvals, interviews outside plan-change\'s own grill channel, and archiving remain main-session-only.',
  '- A skipped or failed item is NEVER recorded as success.',
].join('\n')

const DISCOVER_SCHEMA = {
  type: 'object',
  properties: {
    changes: { type: 'array', items: { type: 'string' } },
  },
  required: ['changes'],
}

const SCAFFOLD_SCHEMA = {
  type: 'object',
  properties: {
    item: { type: 'string' },
    outcome: { type: 'string', enum: ['scaffolded', 'failed'] },
    note: { type: 'string' },
  },
  required: ['item', 'outcome'],
}

const COMPOSER_SCHEMA = {
  type: 'object',
  properties: {
    digest_path: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['digest_path', 'summary'],
}

// Defensive args parse: the args transport may deliver a JSON-encoded string.
const A = (typeof args === 'string') ? JSON.parse(args) : (args || {})
const ROOT = A.repoRoot ? 'cd ' + A.repoRoot + ' && ' : ''
const STORE = A.store ? ' --store ' + A.store : ''
const PLAN_MODE = A.planMode || 'one' // proposals-only default (lived evidence: full authoring without grill rounds is dangerous)
const DIGEST = A.digestFile || 'CAMPAIGN.md'
// Model tiers (add-pipeline-efficiency D1): flash defaults, host-overridable per run.
const MODELS = {
  utility: A.utilityModel || 'qwen/qwen3.8-flash',
}
// Forwarded into every per-item plan-change invocation (host may override per run).
const PLAN_MODEL_ARGS = {
  authorModel: A.authorModel || null,
  utilityModel: A.utilityModel || null,
}
if (PLAN_MODE !== 'one' && PLAN_MODE !== 'scaffold') {
  throw new Error("args.planMode must be 'one' or 'scaffold' — deeper authoring per item is an explicit host re-invocation, never a campaign default")
}

// --- Phase: Discover --------------------------------------------------------
phase('Discover')
let items = []
let discoverySource = 'args'
if (Array.isArray(A.items) && A.items.length) {
  // Explicit items argument wins — no discovery result is merged in.
  items = A.items.map(function (it) {
    return typeof it === 'string' ? { change: it, intent: null } : { change: it.change, intent: it.intent || null }
  })
} else {
  discoverySource = 'openspec list'
  const disc = await agent(
    [TOOL, 'Run: ' + ROOT + 'openspec list --json' + STORE,
     'Return the names of ALL pending changes as {changes: [name, ...]} (the campaign will scaffold any that do not exist yet).',
     'If openspec list reports zero changes, return {changes: []}.',
    ].join('\n'),
    { label: 'discover', phase: 'Discover', agentType: 'general-purpose', effort: 'minimal', model: MODELS.utility, schema: DISCOVER_SCHEMA },
  )
  items = (disc && disc.changes) ? disc.changes.map(function (n) { return { change: n, intent: null } }) : []
}
log('Campaign: ' + items.length + ' item(s), discovery: ' + discoverySource + ', planMode: ' + PLAN_MODE)
if (!items.length) {
  return { items_total: 0, outcomes: { ok: 0, needs_input: 0, failed: 0 }, shards: [], digest_path: null, next: 'host-review-or-add-items', note: 'Degenerate campaign — no items discovered, no per-item work invoked.' }
}

// --- Phase: Scaffold (STRICTLY SERIAL — global-mutating verb) ----------------
phase('Scaffold')
const shards = []
for (const item of items) {
  const sc = await agent(
    [TOOL, CONTRACT,
     'Scaffold item "' + item.change + '": run ' + ROOT + 'openspec new change "' + item.change + '"' + STORE,
     'If it already exists, treat that as scaffolded (note it). If the command fails for another reason, return outcome "failed" with the note — never retry.',
     'Do NOT author any artifact. Do NOT run any other openspec verb.',
    ].join('\n'),
    { label: 'scaffold:' + item.change, phase: 'Scaffold', agentType: 'general-purpose', effort: 'minimal', model: MODELS.utility, schema: SCAFFOLD_SCHEMA },
  )
  const outcome = sc && sc.outcome === 'failed' ? 'failed' : 'scaffolded'
  shards.push({ item: item.change, mode: PLAN_MODE, step: 'scaffold', outcome: outcome, note: (sc && sc.note) || '', written_path: null, question: null })
  log('Scaffolded ' + item.change + ': ' + outcome)
  // Serial by construction: this for-loop awaits each scaffold before the next.
}

// --- Phase: Plan (one-level-deep fan-out per scaffolded item) ----------------
phase('Plan')
const planTargets = shards.filter(function (sh) { return sh.outcome === 'scaffolded' })
const planResults = await parallel(
  planTargets.map(function (sh) {
    const item = items.find(function (it) { return it.change === sh.item })
    return function () {
      return workflow('openspec-plan-change', {
        change: sh.item,
        mode: PLAN_MODE,
        repoRoot: A.repoRoot || null,
        store: A.store || null,
        intent: item ? item.intent : null,
        authorModel: PLAN_MODEL_ARGS.authorModel,
        utilityModel: PLAN_MODEL_ARGS.utilityModel,
      })
    }
  }),
)
planTargets.forEach(function (sh, i) {
  const r = planResults[i]
  const shard = shards.find(function (x) { return x.item === sh.item && x.step === 'scaffold' })
  const planShard = { item: sh.item, mode: PLAN_MODE, step: 'plan', outcome: 'failed', note: '', written_path: null, question: null }
  if (!r) {
    planShard.note = 'plan-change returned null — treated as failed, never as success'
  } else if (r.error === 'checkpoint-bridge-not-installed') {
    planShard.outcome = 'failed'
    planShard.note = 'checkpoint-bridge extension not installed in the session (see plan-change guidance)'
  } else if (r.error) {
    planShard.note = 'plan-change error: ' + r.error
  } else if (r.needs_input) {
    planShard.outcome = 'needs_input'
    planShard.question = (r.needs_input.question || '') + (r.needs_input.artifact ? ' (artifact: ' + r.needs_input.artifact + ')' : '')
    planShard.note = 'paused on material ambiguity — question carried verbatim'
  } else if (Array.isArray(r.written) && r.written.length && r.qa_ok !== false) {
    planShard.outcome = 'ok'
    planShard.written_path = r.written.map(function (w) { return w.path }).join(', ')
    planShard.note = r.written.map(function (w) { return w.assumption }).filter(Boolean).join(' | ')
  } else {
    planShard.note = 'no artifact written' // a skipped/absent item is never success
  }
  shards.push(planShard)
})
const outcomes = { ok: 0, needs_input: 0, failed: 0 }
for (const sh of shards) {
  if (sh.step === 'plan') outcomes[sh.outcome] = (outcomes[sh.outcome] || 0) + 1
}
log('Plan done: ' + outcomes.ok + ' ok, ' + outcomes.needs_input + ' needs_input, ' + outcomes.failed + ' failed')

// --- Phase: Compose ----------------------------------------------------------
phase('Compose')
const planShards = shards.filter(function (sh) { return sh.step === 'plan' })
const composer = await agent(
  [TOOL,
   'Fold these campaign shard records into a single digest file at: ' + (A.repoRoot ? A.repoRoot + '/' : '') + DIGEST,
   'OVERWRITE if present. Atomic bullets and Markdown tables only — no prose walls. Sections in this order:',
   '# Campaign Digest — ' + items.length + ' item(s), planMode ' + PLAN_MODE,
   '## Outcomes — aggregate counts: ok / needs_input / failed',
   '## Per-item table: | Item | Outcome | Written path | Question / assumption |',
   '## Next actions per item — ONLY re-run, interview (needs_input questions), or ready-for-host-review.',
   '  The digest MUST NOT contain any apply, archive, or update instruction — those are main-session-only.',
   '',
   'SHARD RECORDS (complete and authoritative):',
   JSON.stringify(planShards),
   '',
   'If composing is ambiguous, ask the host at most ONCE via ask_user_via_host (all questions batched);',
   'if no answer is available, record the ambiguity in the digest instead of guessing.',
   'Return {digest_path, summary} — summary under 120 words.',
  ].join('\n'),
  { label: 'compose', phase: 'Compose', agentType: 'general-purpose', effort: 'medium', model: MODELS.utility, schema: COMPOSER_SCHEMA },
)

return {
  items_total: items.length,
  discovery_source: discoverySource,
  plan_mode: PLAN_MODE,
  outcomes,
  shards,
  digest_path: composer ? composer.digest_path : (A.repoRoot ? A.repoRoot + '/' : '') + DIGEST,
  composer_summary: composer ? composer.summary : null,
  next: 'host-review-proposals-then-decide',
  note: 'The campaign scaffolded and planned but never applied, archived, or updated — review proposals in the main session and decide per item.',
}
