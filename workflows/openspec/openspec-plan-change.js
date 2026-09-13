export const meta = {
  name: 'openspec-plan-change',
  description:
    'Schema-driven OpenSpec authoring for ONE change: resolve the artifact graph via the CLI, author the next ready artifact from its template/instruction, QA it, and report. Modes: scaffold (create + first instructions, no write) | one (default; author exactly one artifact) | apply-ready (loop resolve→author→QA until every planning artifact is done/skipped, capped by maxArtifacts). Ambiguities go through the checkpoint-bridge ask_user_via_host tool; without the bridge the workflow returns structured needs_input instead of guessing. Never applies, never archives.',
  phases: [
    { title: 'Resolve', detail: 'optional new change + status --json graph snapshot' },
    { title: 'Author', detail: 'write the first ready artifact from its template; grill via ask_user_via_host if armed' },
    { title: 'QA', detail: 'template coverage, no leaked rules/context, dependencies cited' },
  ],
}

const TOOL = [
  'TOOL DISCIPLINE: issue at most ONE tool call per message; never batch two or more tool calls in a single turn.',
  'If a tool call is rejected as malformed, silently re-issue that ONE call cleanly. Never restate or quote tool-call markup as text.',
  'End by calling StructuredOutput exactly once with the required object — do not answer in prose instead.',
].join('\n')

const CONTRACT = [
  'CLI CONTRACT: openspec status --change <name> --json and openspec instructions <artifact> --change <name> --json are the',
  'source of truth. Never hardcode artifact ids or paths — use resolvedOutputPath / existingOutputPaths from the CLI.',
  'Do not copy "context" or "rules" payloads into the artifact file; they are guidance for you.',
  'Re-read dependency artifacts from disk — the user may have edited them.',
  'If an artifact or instruction reports skipped (e.g. skip_specs: true), DO NOT create its files.',
  'A zero-delta change needs skip_specs: true in its .openspec.yaml — never invent a requirement to satisfy validation.',
  'MUTATION RIGHTS: you may write ONLY the one artifact file this run assigns you, at its resolvedOutputPath.',
  'Never run: openspec archive, openspec update, or any command that moves or syncs state.',
].join('\n')

const GRILL = [
  'CHECKPOINT RULE (human authority): if material scope is genuinely unknown — an ambiguity whose answer would change',
  'what you write — call the ask_user_via_host tool ONCE with ALL your questions batched (it relays to the human via the',
  'checkpoint-bridge). If ask_user_via_host returns status "ok", use the answers. For ANY other status (no-host, timeout,',
  'timeout-or-cancelled, cancelled, error) DO NOT guess and DO NOT retry: return action "needs_input" with the',
  'question field stating exactly what the host session must decide.',
].join('\n')

const GRAPH_SCHEMA = {
  type: 'object',
  properties: {
    change: { type: 'string' },
    schema_name: { type: 'string' },
    change_root: { type: 'string' },
    planning_complete: { type: 'boolean' },
    apply_requires: { type: 'array', items: { type: 'string' } },
    artifacts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['done', 'skipped', 'ready', 'blocked'] },
          requires: { type: 'array', items: { type: 'string' } },
          output_path: { type: 'string' },
        },
        required: ['id', 'status'],
      },
    },
    tasks: {
      type: 'object',
      properties: { total: { type: 'number' }, done: { type: 'number' } },
      required: ['total', 'done'],
    },
    bridge_present: { type: 'boolean', description: 'whether the checkpoint-bridge ask_user_via_host tool is available in this session' },
  },
  required: ['change', 'schema_name', 'planning_complete', 'artifacts'],
}

const WRITE_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    action: { type: 'string', enum: ['wrote', 'skipped', 'needs_input'] },
    path: { type: 'string' },
    question: { type: 'string' },
    assumption: { type: 'string' },
  },
  required: ['id', 'action'],
}

const QA_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    ok: { type: 'boolean' },
    fixes: { type: 'array', items: { type: 'string' } },
  },
  required: ['id', 'ok'],
}

// Defensive args parse: the args transport may deliver a JSON-encoded string.
const A = (typeof args === 'string') ? JSON.parse(args) : (args || {})
const CHANGE = A.change
const MODE = A.mode || 'one'
const RETRY_PAUSE_MS = (A.retryPauseMs == null ? 45000 : Math.max(0, Number(A.retryPauseMs) || 0))
// add-fallback-retry-pause: ONE bounded pause (gate-sleep trick — deterministic, no jitter/Date.now),
// then ONE primary retry, before the cross-provider chain. Best-effort: a failed pause child never blocks.
async function pauseOnce(ms, label) {
  if (!ms || ms <= 0) return
  log('retry pause: ' + ms + 'ms before retrying/fallback (429 remedy: retry shortly) — ' + (label || 'agentFB'))
  try {
    await agent('Reply with exactly: paused. Do not use any tools.', {
      label: 'retry-pause:' + (label || 'agentFB'),
      agentType: 'general-purpose',
      effort: 'minimal',
      model: (typeof MODELS !== 'undefined' && MODELS.utility) || 'qwen/qwen3.8-flash',
      gate: 'sleep ' + Math.ceil(ms / 1000) + ' && true',
    })
  } catch (e) { /* best-effort: a failed pause child never blocks */ }
}
async function agentFB(prompt, opts) {
  const r = await agent(prompt, opts)
  if (r !== null && r !== undefined) return r
  const primary = (opts && opts.model) || null
  const chain = chainFor(primary)
  if (!chain.length) return r
  if (RETRY_PAUSE_MS > 0) {
    // add-fallback-retry-pause: cover the 429 "retry shortly" window, then ONE primary retry.
    await pauseOnce(RETRY_PAUSE_MS, (opts && opts.label) || '')
    const rp = await agent(prompt, opts)
    if (rp !== null && rp !== undefined) return rp
    log('primary retry after the pause still failed — proceeding to the fallback chain')
  } else {
    log('fallback hop: agent "' + ((opts && opts.label) || '') + '" returned null on ' + (primary || 'the default model') + ' (terminal provider error, e.g. 429 shared-pool rate limit) — retrying on: ' + chain[0])
  }
  for (let i = 0; i < chain.length; i++) {
    const fb = Object.assign({}, opts, { model: chain[i] })
    delete fb.resume
    delete fb.gate
    const rr = await agent(prompt, fb)
    if (rr !== null && rr !== undefined) return rr
    if (i + 1 < chain.length) log('fallback hop: ' + chain[i] + ' also failed — next: ' + chain[i + 1])
  }
  return null
}
const ROOT = A.repoRoot ? 'cd ' + A.repoRoot + ' && ' : ''
const STORE = A.store ? ' --store ' + A.store : ''

// Model tiers (add-pipeline-efficiency D1): flash defaults, host-overridable per run.
const MODELS = {
  author: A.authorModel || 'qwen/qwen3.8-flash',
  utility: A.utilityModel || 'qwen/qwen3.8-flash',
}
if (!CHANGE) {
  throw new Error('args.change is required — the kebab-case change name')
}
if (MODE !== 'one' && MODE !== 'scaffold' && MODE !== 'apply-ready') {
  throw new Error(
    "args.mode must be 'one', 'scaffold' or 'apply-ready' — other values are not defined",
  )
}
log('plan-change: ' + CHANGE + ' | mode: ' + MODE)

// --- Phase: Resolve ---------------------------------------------------------
phase('Resolve')
const snap = await agentFB(
  [
    TOOL,
    CONTRACT,
    'Target change: "' + CHANGE + '".',
    A.create
      ? 'First create it if it does not exist: ' + ROOT + 'openspec new change "' + CHANGE + '"' + STORE + ' (ignore an already-exists error, note it).'
      : 'Do NOT create the change — if it does not exist, report empty artifacts and planning_complete=false.',
    'Then run: ' + ROOT + 'openspec status --change "' + CHANGE + '" --json' + STORE,
    'Return the graph snapshot: change, schema_name, change_root, planning_complete, apply_requires, and the artifacts array',
    '(id, status, requires, outputPath for every artifact, in the CLI\'s dependency order). Do NOT write any file.',
    'If the openspec command fails or returns a null-shape: set schema_name to "CLI-ERROR", artifacts to [], planning_complete to false — NEVER fabricate an empty healthy graph.',
  ].join('\n'),
  { label: 'resolve:' + CHANGE, phase: 'Resolve', agentType: 'general-purpose', effort: 'minimal', model: MODELS.utility, schema: GRAPH_SCHEMA },
)
if (!snap) {
  return { change: CHANGE, mode: MODE, error: 'resolve-failed' }
}
if (snap.bridge_present === false && MODE !== 'scaffold') {
  log('ERROR: checkpoint-bridge extension is not installed in this session — refusing to author without it (grill rounds would be silently downgraded).')
  return {
    change: CHANGE,
    mode: MODE,
    schema_name: snap.schema_name,
    error: 'checkpoint-bridge-not-installed',
    guidance: 'openspec* authoring workflows need the checkpoint-bridge extension for grill rounds (ask_user_via_host). Install: pi install npm:pi-checkpoint-bridge — or wire extensions/checkpoint-bridge via your Pi profile (e.g. Outfitter). This is not a crash: fix the wiring and re-run.',
  }
}
const readyArtifacts = snap.artifacts.filter(function (a) { return a.status === 'ready' })
if (MODE === 'scaffold') {
  return {
    change: CHANGE,
    mode: MODE,
    schema_name: snap.schema_name,
    change_root: snap.change_root,
    created: !!A.create,
    first_ready: readyArtifacts.length ? readyArtifacts[0].id : null,
    next: 'host-interview-then-one',
    note: 'Scaffold only — no artifact written. The host session runs the interview, then re-runs with mode "one".',
  }
}
if (!readyArtifacts.length) {
  return {
    change: CHANGE,
    mode: MODE,
    schema_name: snap.schema_name,
    planning_complete: snap.planning_complete,
    written: [],
    next: snap.planning_complete ? 'host-validate-then-authorize-apply' : 'host-resolve-blocked-graph',
    note: 'No artifact is ready — either planning is complete or the graph is blocked on missing dependencies.',
  }
}

// --- Phase: Apply-ready loop (mode: apply-ready) ----------------------------
// D1–D3: reuse the per-artifact agent trio; the CLI status graph is the only
// state — re-snapshot after every author+QA; only done/skipped settle an
// artifact; maxArtifacts counts artifacts authored in THIS run; a later run
// resumes idempotently because settled artifacts are never re-authored.
if (MODE === 'apply-ready') {
  const cap = Math.max(1, Number(A.maxArtifacts) || 12)
  const written = []
  const skipped = []
  let authored = 0
  let iteration = 0
  // Runaway guards (pilot 2026-09-06: 79 agents before kill): an author-returned
  // 'skipped' NEVER settles in `openspec status` for conditional artifacts — the
  // loop settles it locally via skipSettled and carries a hard iteration bound.
  const skipSettled = new Set()
  const maxIterations = cap * 2 + 4
  while (authored < cap && iteration < maxIterations) {
    iteration++
    const s = iteration === 1 ? snap : await agentFB(
      [TOOL, 'Re-run: ' + ROOT + 'openspec status --change "' + CHANGE + '" --json' + STORE + ' and return the graph snapshot only. Do NOT write any file. If the command fails, set schema_name to "CLI-ERROR" and artifacts to [] — never fabricate.'].join('\n'),
      { label: 'status:' + CHANGE + ':' + iteration, phase: 'Resolve', agentType: 'general-purpose', effort: 'minimal', model: MODELS.utility, schema: GRAPH_SCHEMA },
    )
    if (!s) return { change: CHANGE, mode: MODE, error: 'status-failed', authored, note: 'status agent returned null — re-run resumes idempotently' }
    const ready = s.artifacts.filter(function (a) { return a.status === 'ready' && !skipSettled.has(a.id) })
    if (!ready.length) break // loop terminates: everything is done/skipped or blocked
    for (const art of ready) {
      if (authored >= cap) break
      const res = await agentFB(
        [TOOL, CONTRACT, GRILL, '',
        'CONTEXT DISCIPLINE: the CLI payloads and the dependency artifacts you read are your sources — cite them; do not re-read unrelated files. TOOL ROUTING (hard rule): every command via ctx_shell, every content search via ctx_grep, file reads via ctx_read or bounded ranges — NEVER native bash/grep/read for covered operations. Sole exception: the ctx tool returns "not found" — fall back to the native tool and SAY SO in your final reply.',
         'Intent from the host (may be empty — rely on existing artifacts and the user): ' + (A.intent || '(none provided)'),
         '',
         'Steps:',
         '1. If status is already done/skipped, return action accordingly (idempotent — write nothing).',
         '2. Run: ' + ROOT + 'openspec instructions ' + art.id + ' --change "' + CHANGE + '" --json' + STORE,
         '3. Read each dependency artifact it lists from disk (once each).',
         '4. If the instruction says skipped/warning — return action "skipped" (write nothing).',
         '5. If scope is ambiguous — follow the CHECKPOINT RULE above.',
         '6. Otherwise write the artifact at resolvedOutputPath, filling EVERY section the template defines, with',
         '   dependency-derived content (cite which files informed decisions in one line each). RFC-2119 requirements',
         '   use SHALL/MUST; scenario blocks use four-hash #### headings.',
         '7. Return {id, action:"wrote", path, assumption?} — assumption = any judgment call you made, one line.',
        ].join('\n'),
        { label: 'author:' + art.id + ':' + iteration, phase: 'Author', agentType: 'general-purpose', effort: 'high', model: MODELS.author, schema: WRITE_SCHEMA },
      )
      if (!res) {
        // Null is a blocker, never success — stop and surface remaining work.
        return {
          change: CHANGE, mode: MODE, error: 'author-failed', artifact: art.id, authored,
          remaining: s.artifacts.filter(function (a) { return a.status !== 'done' && a.status !== 'skipped' }).map(function (a) { return a.id }),
          note: 'author agent returned null — treated as a blocker (never success); re-run resumes idempotently',
        }
      }
      if (res.action === 'needs_input') {
        return {
          change: CHANGE, mode: MODE,
          needs_input: { artifact: art.id, question: res.question || 'host decision required' },
          authored, written, skipped,
          remaining: s.artifacts.filter(function (a) { return a.status !== 'done' && a.status !== 'skipped' && !skipSettled.has(a.id) }).map(function (a) { return a.id }),
          next: 'host-decide-then-resume',
          note: 'Paused on material ambiguity — no file was written from a guessed answer. The host decides, then re-invokes; settled artifacts are not re-authored.',
        }
      }
      if (res.action === 'skipped') {
        skipped.push({ id: art.id, path: null })
        skipSettled.add(art.id) // conditionally-optional artifact: settles locally, status will stay 'ready'
        log('Skipped by author: ' + art.id + ' (no file written; settled for this run)')
        continue
      }
      written.push({ id: art.id, path: res.path, assumption: res.assumption || null })
      authored++
      // QA is deliberately UNSCHEMAD and gate-based: a live pilot (2026-09-06)
      // showed a schema'd QA child looping forever — it called StructuredOutput
      // 104 times, every call succeeded ("Recorded."), and the child still never
      // terminated (engine-side anomaly, possibly a race). A child with no
      // StructuredOutput obligation ends naturally after its final message, and
      // the gate makes a failing strict validation fail the agent: a non-null
      // qa return therefore MEANS the strict validation passed.
      const qa = await agentFB(
        [TOOL,
         'QA pass for artifact ' + art.id + ' at ' + (res.path || 'its resolvedOutputPath') + ' (change "' + CHANGE + '").',
         'READ the file, then check and FIX IN PLACE only mechanical defects:',
         '- every template section present and non-empty;',
         '- no leaked CLI payloads: "context": or "rules": JSON fragments or <placeholders> left verbatim;',
         '- dependency artifacts actually cited where decisions reference them;',
         '- RFC-2119 keyword presence in requirement lines; four-hash #### scenario headings.',
         'After any fixes, run: ' + ROOT + 'openspec validate "' + CHANGE + '" --type change --strict' + STORE,
         '  (a partial plan may legitimately fail because LATER artifacts are missing — if so, say so in your final text,',
         '   unless the failure names THIS artifact, in which case fix the wording in this file only and re-run once).',
         'Finish with a short text verdict (no tool calls after it): whether the artifact is defect-free and what the',
         'strict validation said.',
        ].join('\n'),
        { label: 'qa:' + art.id + ':' + iteration, phase: 'QA', agentType: 'general-purpose', effort: 'medium', model: MODELS.utility,
          gate: ROOT + 'openspec validate "' + CHANGE + '" --type change --strict' + STORE },
      )
      log('Authored+QA: ' + art.id + ' (' + authored + '/' + cap + ')' + (qa ? '' : ' — QA/strict-gate FAILED (non-blocking here; the final status + host review catch it)'))
    }
  }
  const final = await agentFB(
    [TOOL, 'Final status: ' + ROOT + 'openspec status --change "' + CHANGE + '" --json' + STORE + ' — return the graph snapshot only. Do NOT write any file. If the command fails, set schema_name to "CLI-ERROR" and artifacts to [] — never fabricate.'].join('\n'),
    { label: 'final-status:' + CHANGE, phase: 'Resolve', agentType: 'general-purpose', effort: 'minimal', model: MODELS.utility, schema: GRAPH_SCHEMA },
  )
  const remaining = final
    ? final.artifacts.filter(function (a) { return a.status !== 'done' && a.status !== 'skipped' && !skipSettled.has(a.id) }).map(function (a) { return a.id })
    : []
  return {
    change: CHANGE, mode: MODE, schema_name: (final && final.schema_name) || snap.schema_name,
    authored, written, skipped, needs_input: null,
    remaining, planning_complete: final ? final.planning_complete === true : false,
    next: final && final.planning_complete ? 'host-authorize-apply' : 'host-resume-apply-ready',
  }
}
const target = readyArtifacts[0]
log('Authoring artifact: ' + target.id + ' (of ' + readyArtifacts.length + ' ready)')

// --- Phase: Author ----------------------------------------------------------

const written = await agentFB(
  [
    TOOL,
    CONTRACT,
    GRILL,
    '',
    'Assign artifact: ' + target.id + ' (change "' + CHANGE + '").',
    'CONTEXT DISCIPLINE: the CLI payloads and the dependency artifacts you read are your sources — cite them; do not re-read unrelated files. TOOL ROUTING (hard rule): every command via ctx_shell, every content search via ctx_grep, file reads via ctx_read or bounded ranges — NEVER native bash/grep/read for covered operations. Sole exception: the ctx tool returns "not found" — fall back to the native tool and SAY SO in your final reply.',
    'Intent from the host (may be empty — rely on existing artifacts and the user): ' + (A.intent || '(none provided)'),
    '',
    'Steps:',
    '1. If status is already done/skipped, return action accordingly (idempotent — write nothing).',
    '2. Run: ' + ROOT + 'openspec instructions ' + target.id + ' --change "' + CHANGE + '" --json' + STORE,
    '3. Read each dependency artifact it lists from disk (once each).',
    '4. If the instruction says skipped/warning — return action "skipped" (write nothing).',
    '5. If scope is ambiguous — follow the CHECKPOINT RULE above.',
    '6. Otherwise write the artifact at resolvedOutputPath, filling EVERY section the template defines, with',
    '   dependency-derived content (cite which files informed decisions in one line each). RFC-2119 requirements',
    '   use SHALL/MUST; scenario blocks use four-hash #### headings.',
    '7. Return {id, action:"wrote", path, assumption?} — assumption = any judgment call you made, one line.',
  ].join('\n'),
  { label: 'author:' + target.id, phase: 'Author', agentType: 'general-purpose', effort: 'high', model: MODELS.author, schema: WRITE_SCHEMA },
)
if (!written) {
  return { change: CHANGE, mode: MODE, error: 'author-failed', artifact: target.id, note: 'author agent returned null — inspect the run; do not retry automatically (null may be a deliberate skip)' }
}
if (written.action !== 'wrote') {
  return {
    change: CHANGE,
    mode: MODE,
    written: [],
    needs_input: written.action === 'needs_input' ? { artifact: target.id, question: written.question || 'host decision required' } : null,
    skipped: written.action === 'skipped' ? [target.id] : [],
    next: written.action === 'needs_input' ? 'host-grill-then-reone' : 'host-resolve-blocked-graph',
  }
}
log('Wrote: ' + (written.path || target.id))

// QA is unschemad + gate-based (see the apply-ready branch for why — a schema'd
// QA child looped forever on successful StructuredOutput calls). A non-null qa
// therefore MEANS the strict validation passed; qa text is the child's verdict.
const qa = await agentFB(
  [
    TOOL,
    'QA pass for artifact ' + target.id + ' at ' + (written.path || 'its resolvedOutputPath') + ' (change "' + CHANGE + '").',
    'READ the file, then check and FIX IN PLACE only mechanical defects:',
    '- every template section present and non-empty;',
    '- no leaked CLI payloads: "context": or "rules": JSON fragments or <placeholders> left verbatim;',
    '- dependency artifacts actually cited where decisions reference them;',
    '- RFC-2119 keyword presence in requirement lines; four-hash #### scenario headings.',
    'After any fixes, run: ' + ROOT + 'openspec validate "' + CHANGE + '" --type change --strict' + STORE,
    '  (a partial plan may legitimately fail because LATER artifacts are missing — if so, say so in your final text,',
    '   unless the failure names THIS artifact, in which case fix the wording in this file only and re-run once).',
    'Finish with a short text verdict (no tool calls after it): whether the artifact is defect-free and what the',
    'strict validation said.',
  ].join('\n'),
  { label: 'qa:' + target.id, phase: 'QA', agentType: 'general-purpose', effort: 'medium', model: MODELS.utility,
    gate: ROOT + 'openspec validate "' + CHANGE + '" --type change --strict' + STORE },
)

return {
  change: CHANGE,
  mode: MODE,
  schema_name: snap.schema_name,
  written: [{ id: target.id, path: written.path, assumption: written.assumption || null }],
  qa_ok: qa ? true : null,
  qa_note: qa ? String(qa).slice(0, 300) : 'QA/strict-gate FAILED — the artifact needs review before continuing',
  needs_input: null,
  remaining_ready: readyArtifacts.length - 1,
  planning_complete: snap.planning_complete,
  next: 'host-review-then-continue',
}
