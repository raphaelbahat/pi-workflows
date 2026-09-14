export const meta = {
  name: 'openspec-apply-change',
  description:
    'Per-task implementation pipeline for ONE planning-complete OpenSpec change: Load (instructions apply --json, fail-fast on blocked) → Implement (implementer agent + separate checkbox-verifier agent per task, CLI order) → Escalate (ONE batched ask_user_via_host on the first blocker) → Report. The implementer never marks its own checkbox; archive/update are permanently main-session-only.',
  phases: [
    { title: 'Load', detail: 'instructions apply --json once; fail fast with missingArtifacts when blocked' },
    { title: 'Implement', detail: 'per task: implementer agent, then checkbox-verifier agent; re-query CLI per dispatch' },
    { title: 'Escalate', detail: 'one batched checkpoint-bridge ask on the first blocker; resume on ok' },
    { title: 'Report', detail: 'final progress + worktrees + host-only next steps' },
  ],
}

const TOOL = [
  'TOOL DISCIPLINE: issue at most ONE tool call per message; never batch two or more tool calls in a single turn.',
  'If a tool call is rejected as malformed, silently re-issue that ONE call cleanly — AT MOST 3 TIMES. After 3 rejections of the same call, stop retrying and return your best-effort text answer. Never loop on a rejected call. Never restate or quote tool-call markup as text.',
  'SHELL & SEARCH RULE: use ctx_shell/ctx_grep/ctx_read ONLY IF they are present in your session\'s tool list (check before first use); in workflow-spawned sub-agent sessions they are typically ABSENT — then run commands with bash, searches with grep, and reads with read directly, WITHOUT retrying ctx tools. Token economy still applies: pipe long outputs through | tail -50 and prefer targeted reads.',
  'End your run with ONE final answer. If a StructuredOutput tool is available in your session, call it exactly once with the required object; otherwise end with a plain-text answer (raw JSON is fine) and stop. Do not answer in prose when the tool is required.',
].join('\n')
const IMPLEMENTER_CONTRACT = [
  'IMPLEMENTER CONTRACT (verbatim prohibitions — contractual trust model, ADR-0002):',
  '- You MUST NOT create, edit, or delete tasks.md. Marking checkboxes is forbidden for you.',
  '- You MUST NOT run `openspec archive`, `openspec update`, or ANY openspec verb that writes state.',
  '- You implement ONLY the task assigned to you; do not start neighboring tasks.',
  '- If a test gate is active for this run, the gated tests MUST pass before you report implemented.',
].join('\n')

const VERIFIER_CONTRACT = [
  'VERIFIER CONTRACT (verbatim prohibitions — contractual trust model, ADR-0002):',
  '- You are the ONLY agent allowed to edit tasks.md, and only to mark THIS task checkbox from `[ ]` to `[x]`.',
  '- You MUST NOT implement or fix code — verification only.',
  '- You verify by reading the implemented files/diff yourself, NEVER by trusting the implementer report.',
  '- Every claim in evidence[] must cite a file:line, command output, or test result.',
].join('\n')

const APPLY_SNAP_SCHEMA = {
  type: 'object',
  properties: {
    state: { type: 'string', enum: ['blocked', 'ready', 'all_done'] },
    change_dir: { type: 'string' },
    progress: {
      type: 'object',
      properties: { total: { type: 'number' }, complete: { type: 'number' }, remaining: { type: 'number' } },
      required: ['total', 'complete', 'remaining'],
    },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          description: { type: 'string' },
          done: { type: 'boolean' },
        },
        required: ['id', 'description', 'done'],
      },
    },
    missing_artifacts: { type: 'array', items: { type: 'string' } },
    instruction_excerpt: { type: 'string' },
  },
  required: ['state', 'progress', 'tasks'],
}

const TASK_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    task_id: { type: 'string' },
    status: { type: 'string', enum: ['implemented', 'paused', 'failed'] },
    summary: { type: 'string' },
    files_touched: { type: 'array', items: { type: 'string' } },
    worktree_path: { type: 'string' },
    test_outcome: { type: 'string' },
    question_for_host: { type: 'string' },
    handoff: { type: 'string', description: '≤200 words written FOR THE NEXT SUB-AGENT (the verifier that will verify this task, then the next task\'s implementer) — to make the context immediately at reach for them: absolute paths touched + a few words on what changed in each, PLUS a look-up hint per touched file (one keyword/short string to grep + the changed line range as of your last edit — prefer the keyword if unsure); decisions made and why (one line each); gotchas/pitfalls hit; current test state; and up to THREE ranked must-know items (1 = most critical)' },
  },
  required: ['task_id', 'status', 'summary'],
}

const VERIFY_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    task_id: { type: 'string' },
    verified: { type: 'boolean' },
    evidence: { type: 'array', items: { type: 'string' } },
    marked: { type: 'boolean' },
    blocker_reason: { type: 'string' },
    handoff: { type: 'string', description: '≤200 words written FOR THE NEXT SUB-AGENT (the next task\'s implementer — and the verifier re-running this task if it was deferred) — to make the context immediately at reach for them: what you verified and how (file:line anchors), look-up hints for anything the next agent will need to find (grep keyword/short string first, line range as of your last edit second), gotchas, open risks, current test state, and up to THREE ranked must-know items (1 = most critical)' },
  },
  required: ['task_id', 'verified', 'evidence', 'marked'],
}

const ESCALATION_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ok', 'timeout-or-cancelled', 'timeout', 'cancelled', 'no-host', 'error'] },
    answers: {
      type: 'array',
      items: {
        type: 'object',
        properties: { question: { type: 'string' }, answer: { type: 'string' } },
        required: ['question', 'answer'],
      },
    },
  },
  required: ['status'],
}

function parseAgentJson(text, fallback) {
  const raw = String(text || '').trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenced ? fenced[1] : raw
  try { return JSON.parse(candidate) } catch (_) {}
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try { return JSON.parse(candidate.slice(start, end + 1)) } catch (_) {}
  }
  return fallback
}

// Defensive args parse: the args transport may deliver a JSON-encoded string.
const A = (typeof args === 'string') ? JSON.parse(args) : (args || {})
const CHANGE = A.change
const ROOT = A.repoRoot ? 'cd ' + A.repoRoot + ' && ' : ''
const STORE = A.store ? ' --store ' + A.store : ''
const WORKTREE = A.worktree === true
const TESTGATE = A.testGate === true
  const TESTCOMMAND = A.testCommand || null
  // Unanswered-escalation policy (host-configurable): 'defer' skips the task and lists it for the host;
  // 'fix' grants ONE bounded self-guided fix round (implementer resumes with best judgment, then a fresh verifier re-gates).
  const UNANSWERED = String(A.onUnansweredEscalation || 'defer').toLowerCase() === 'fix' ? 'fix' : 'defer'
  const selfFixRounds = {} // per-task self-guided fix counter — hard bound: one round per task

  // Model tiers (add-pipeline-efficiency D1): flash defaults, host-overridable per run.
  const MODELS = {
    implementer: A.implementerModel || 'deepseek/deepseek-v4.1-flash',
    verifier: A.verifierModel || 'qwen/qwen3.8-flash',
    utility: A.utilityModel || 'qwen/qwen3.8-flash',
  }

// --- Model fallback (add-workflow-model-fallback D1/D2) ---------------------
// Terminal provider failures (pi-subagents retries transient errors internally;
// e.g. OpenRouter shared-pool 429) resolve agent() to null — agentFB retries the SAME
// call down a hardcoded cross-provider chain, filtered to the models the Load phase
// discovered via `pi --list-models` (secret-free; never auth.json/models.json).
const FALLBACKS = {
  'qwen/qwen3.8-flash': ['deepseek/deepseek-v4.1-flash', 'z-ai/glm-5.3-flash'],
  'deepseek/deepseek-v4.1-flash': ['qwen/qwen3.8-flash', 'z-ai/glm-5.3-flash'],
  'z-ai/glm-5.3-flash': ['qwen/qwen3.8-flash'],
}
let AUTHENTICATED_MODELS = null // set by the Load-phase discovery; null = unfiltered
function chainFor(primary) {
  const base = FALLBACKS[primary] || ['deepseek/deepseek-v4.1-flash', 'qwen/qwen3.8-flash', 'z-ai/glm-5.3-flash']
  let chain = base.filter(function (m) { return m !== primary })
  if (AUTHENTICATED_MODELS && AUTHENTICATED_MODELS.length) {
    chain = chain.filter(function (m) { return AUTHENTICATED_MODELS.indexOf(m) !== -1 })
  }
  return chain
}
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
let DISCOVERY_ATTEMPTED = false // lazy D2: discover once, at the first terminal fallback need
async function pauseAndDiscover(ms, label) {
  log('lazy model discovery + ' + (ms > 0 ? ms + 'ms pause' : 'no pause') + ' before retry/fallback — ' + (label || 'agentFB'))
  const pauseGate = ms > 0 ? 'sleep ' + Math.ceil(ms / 1000) + ' && true' : null
  const dopts = {
    label: 'retry-pause+discovery:' + (label || 'agentFB'),
    agentType: 'general-purpose',
    effort: 'minimal',
    model: (typeof MODELS !== 'undefined' && MODELS.utility) || 'qwen/qwen3.8-flash',
  }
  if (pauseGate) dopts.gate = pauseGate
  try {
    const o = dopts
    const resp = await agent([
      'Run exactly this command via ctx_shell: pi --list-models  (the flag is --list-models; there is NO --models flag). Pipe through: 2>&1 | head -300' +
      ' — then parse every provider/model row into "provider/model" strings (the table columns are: provider, model, context, max-out, thinking, images; read provider + model columns only).',
      'NEVER read auth.json or models.json — they contain user secrets.' ,
      'Reply with ONLY a JSON array of the "provider/model" strings (empty array if the command failed). No prose, no wrapper object.' ,
    ].join('\n'), o)
    const parsed = parseAgentJson(resp, null)
    if (parsed && Array.isArray(parsed) && parsed.length) {
      AUTHENTICATED_MODELS = parsed
      log('Discovery (lazy): ' + parsed.length + ' configured models on file for fallback filtering')
    } else {
      log('Discovery (lazy): unavailable — fallback chains stay hardcoded (non-blocking)')
    }
  } catch (e) { /* best-effort: a failed discovery/pause child never blocks */ }
}
async function agentFB(prompt, opts) {
  const r = await agent(prompt, opts)
  if (r !== null && r !== undefined) return r
  const primary = (opts && opts.model) || null
  const chain = chainFor(primary)
  if (!chain.length) return r
  // add-workflow-model-fallback D2 (LAZY): discovery + the 429 pause happen HERE — at the first
  // terminal failure — never eagerly at Load (children were probing pi --list-models on every run).
  const pauseLabel = (opts && opts.label) || ''
  if (!DISCOVERY_ATTEMPTED) {
    await pauseAndDiscover(RETRY_PAUSE_MS, pauseLabel)
    DISCOVERY_ATTEMPTED = true
  } else if (RETRY_PAUSE_MS > 0) {
    await pauseOnce(RETRY_PAUSE_MS, pauseLabel)
  }
  const rp = await agent(prompt, opts)
  if (rp !== null && rp !== undefined) return rp
  log('primary retry after the pause still failed — proceeding to the fallback chain')
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
if (!CHANGE) {
  throw new Error('args.change is required — the kebab-case name of a planning-complete OpenSpec change')
}
if (TESTGATE && !TESTCOMMAND) {
  throw new Error('args.testCommand is required when args.testGate is true — explicit-only for determinism (design Open Question, v1)')
}
log('apply-change: ' + CHANGE + ' | worktree: ' + WORKTREE + ' | testGate: ' + TESTGATE)

const worktrees = [] // every created worktree path is reported; the host integrates or removes

function blockerQuestions(task, impl, verif) {
  const q = []
  q.push('Task ' + task.id + ' is blocked (' + (verif ? 'verification failed: ' + (verif.blocker_reason || 'unverified') : impl ? impl.status + ': ' + impl.summary : 'agent returned null') + '). How should the pipeline proceed? Options: fix guidance, skip this task (host marks it), or abort the run.')
  if (impl && impl.question_for_host) q.push(impl.question_for_host)
  return q
}

// One batched escalation per stop (ADR-0002 D7): a dedicated agent makes the
// single ask_user_via_host call and returns the bridge JSON.
async function escalate(task, impl, verif) {
  const questions = blockerQuestions(task, impl, verif)
  const esc = await agentFB(
    [TOOL,
     'You are the escalation channel for a blocked OpenSpec apply pipeline (change "' + CHANGE + '").',
     'Call the ask_user_via_host tool EXACTLY ONCE with ALL of these questions batched:',
     JSON.stringify(questions.map(function (q) { return { question: q } })),
     'Then return the bridge JSON as {status, answers}. status must be the bridge\'s OWN status string, VERBATIM (it is "ok" when the host answered) — never substitute your own interpretation. Do NOT retry on non-ok statuses; do NOT guess answers.',
    ].join('\n'),
    { label: 'escalate:' + task.id, phase: 'Escalate', agentType: 'general-purpose', effort: 'low', model: MODELS.utility },
  )
  return parseAgentJson(esc, { status: 'error' }) || { status: 'error' }
}

// --- Phase: Load ------------------------------------------------------------
phase('Load')
const snapRaw = await agentFB(
  [TOOL,
   'Load the apply state for change "' + CHANGE + '" WITHOUT modifying anything.',
   'Run: ' + ROOT + 'openspec instructions apply --change "' + CHANGE + '" --json' + STORE,
   'Return the snapshot: state, change_dir, progress, tasks[] (id, description, done), missing_artifacts,',
   'a 10-line excerpt of the instruction string. Do NOT implement anything.',
   'STATE MAPPING (verbatim from the payload): "ready" when progress.remaining > 0; "all_done" when no incomplete tasks remain; "blocked" ONLY when the payload itself reports it with non-empty missingArtifacts. Never infer blocked from anything else.',
  ].join('\n'),
  { label: 'load:' + CHANGE, phase: 'Load', agentType: 'general-purpose', effort: 'medium', model: MODELS.utility },
)
// Corrective retry (campaign 2026-09-14: 4/5 load children returned prose summaries instead of the
// verbatim payload — flash-tier roulette on the same prompt). ONE re-dispatch with a corrective
// instruction; if that also fails to parse, bail (resumes idempotently).
let snap = parseAgentJson(snapRaw, null)
if (!snap) {
  log('load: unparseable output — corrective re-dispatch')
  const snapRetryRaw = await agentFB(
    [TOOL, 'Your previous reply was a PROSE SUMMARY — that is unusable. Run: ' + ROOT + 'openspec instructions apply --change "' + CHANGE + '" --json' + STORE, 'Then reply with ONLY the raw JSON payload of that command inside a ```json fenced block — byte-for-byte, no analysis, no prose, no field mapping commentary. Do NOT implement anything.'].join('\n'),
    { label: 'load-retry:' + CHANGE, phase: 'Load', agentType: 'general-purpose', effort: 'medium', model: MODELS.utility },
  )
  snap = parseAgentJson(snapRetryRaw, null)
}
if (!snap) {
  return { change: CHANGE, error: 'load-failed', note: 'load agent returned unparseable output twice (corrective retry included) — re-run resumes idempotently (checkboxes are the state)' }
}
// Absolute repo root, derived from the CLI's change_dir (authoritative).
// Implementer/verifier file operations MUST resolve against this: a workflow
// child's relative paths resolve against the SESSION cwd, which is frequently a
// different repository (observed 2026-09-06: PILOT-NOTE.md was written into the
// wrong repo and the verifier missed it).
const REPO_ABS = snap.change_dir
  ? snap.change_dir.replace(/\/openspec\/changes\/[^/]+\/?$/, '')
  : (A.repoRoot || null)
if (snap.state === 'blocked' && (snap.missing_artifacts || []).length > 0) { // blocked requires missingArtifacts per the documented shape — an agent misread otherwise (pilot 2026-09-07: minimal-effort Load returned blocked while the CLI said ready)
  return {
    change: CHANGE,
    error: 'blocked',
    missing_artifacts: snap.missing_artifacts || [],
    next: 'host-complete-planning',
    note: 'Planning is incomplete — finish planning (openspec-plan-change) before applying.',
  }
}
  log('Loaded: ' + snap.progress.total + ' tasks, ' + snap.progress.complete + ' complete, state ' + snap.state)

  // Primer (D2): ONE distillation of design/specs for the whole run — later
  // agents consult this instead of re-reading the files (guidance, not authority).
  const handoffLog = []
  function contextBlock() {
    const parts = []
    if (primerText) parts.push('PRIMER (distilled from design/specs — guidance, not authority; the text below IS the primer — do not fetch any file to obtain it):\n' + primerText)
    if (handoffLog.length) parts.push('RECENT HANDOFFS (guidance):\n' + handoffLog.slice(-3).join('\n---\n'))
    return parts.length ? parts.join('\n\n') : '(no primer or handoffs yet — rely on the files)'
  }
  const primerResponse = await agentFB(
    [TOOL,
     'Produce the CONTEXT PRIMER for change "' + CHANGE + '" (change dir: ' + (snap.change_dir || 'openspec/changes/' + CHANGE) + ').',
     'Read design.md and the capability spec files under specs/ ONCE. Distill — ≤1,500 characters —:',
     '- the design decisions (D-numbers + one line each),',
     '- the component/file map (what lives where, absolute paths under the repo root),',
     '- conventions and gotchas a task implementer must know,',
     '- anything in the apply instruction excerpt that changes the tasks.',
     'Reply with the distilled guidance TEXT ITSELF as your final message — plain text, no StructuredOutput tool, no JSON wrapper, never a file path, never a command, never a reference to a file you wrote. Do NOT write any file (no bash writes, no /tmp artifacts). Guidance quality matters: later agents consult THIS text instead of re-reading the files.',
    ].join('\n'),
    { label: 'primer:' + CHANGE, phase: 'Load', agentType: 'general-purpose', effort: 'high', model: MODELS.utility },
  )
  // Text-verdict primer (QA pattern): accept either raw prose or a {primer:...} JSON wrapper.
  const parsedPrimer = parseAgentJson(primerResponse, null)
  const rawPrimer = String((parsedPrimer && parsedPrimer.primer) || primerResponse || '').trim()
  // Pointer-misfire guard (production run #2): a flash-tier primer returned a /tmp file path instead of the text,
  // which sent implementers into a fetch loop. Accept only substantial, non-path-like primer text.
  const primerText = rawPrimer && rawPrimer.length >= 120 && !/^\/(tmp|home)\//.test(rawPrimer) ? rawPrimer.slice(0, 6000) : null
  log('Primer: ' + (primerText ? primerText.length + ' chars' : 'UNAVAILABLE (agents fall back to files)' + (rawPrimer ? ' — rejected misfire: ' + rawPrimer.slice(0, 60) : '')))

// --- Phase: Implement -------------------------------------------------------
phase('Implement')
let guard = 0
const skippedTasks = [] // deferred tasks: escalation went unanswered — the host completes them after the run
let nullStatus = 0
const MAX_ITERATIONS = (snap.progress.total || 0) + 4 // every task + re-queries; hard runaway backstop
while (guard++ < MAX_ITERATIONS) {
  // Re-query per dispatch: the CLI checkbox progress is authoritative (D4).
  const s = guard === 1 ? snap : parseAgentJson(await agentFB(
    [TOOL, 'Re-run: ' + ROOT + 'openspec instructions apply --change "' + CHANGE + '" --json' + STORE + ' — run the command, then reply with EXACTLY its JSON output VERBATIM inside a ```json fenced block and NOTHING else — no prose, no summary. Do NOT implement anything.'].join('\n'),
    { label: 'status:' + CHANGE + ':' + guard, phase: 'Implement', agentType: 'general-purpose', effort: 'minimal' },
  ), null)
  if (!s) {
    nullStatus++
    if (nullStatus >= 3) {
      return { change: CHANGE, error: 'status-failed', progress: snap.progress, note: 'status agent returned null 3x consecutively — re-run resumes idempotently (checkboxes are the state)' }
    }
    log('status query returned null (' + nullStatus + '/3) — retrying')
    continue
  }
  nullStatus = 0
  if (s.state === 'blocked' && (s.missing_artifacts || []).length > 0) { // blocked requires missingArtifacts per the documented shape — an agent misread otherwise
    return { change: CHANGE, error: 'blocked', missing_artifacts: s.missing_artifacts || [], progress: s.progress, next: 'host-complete-planning' }
  }
  const task = (s.tasks || []).find(function (t) { return !t.done && skippedTasks.indexOf(t.id) === -1 })
  if (!task) break // every task complete and verified (or deferred) — Report
  log('Task ' + task.id + ': dispatching implementer')

  // Implementer (effort high). Distinct from the verifier by design (ADR-0002).
const implResponse = await agentFB(
    [TOOL, IMPLEMENTER_CONTRACT, '', contextBlock(), '',
     'Assigned task: ' + task.id + ' — ' + task.description,
     'WORKING DIRECTORY: ' + (REPO_ABS || '(unknown — ask the host)') + ' — EVERY file you create or edit MUST use an ABSOLUTE path under that root. Relative paths resolve against a DIFFERENT session cwd and land in the wrong repository (observed failure).',
     'TOOL ROUTING (hard rule): every command via ctx_shell, every content search via ctx_grep, file reads via ctx_read or bounded ranges — NEVER native bash/grep/read for covered operations. Sole exception: the ctx tool returns "not found" — fall back to the native tool and SAY SO in your final summary. Pipe test runs through | tail -50. Do NOT re-read design.md — the PRIMER covers it; re-read a section only when the primer is insufficient for your task.',
     WORKTREE
       ? 'ISOLATION: create a task-scoped git worktree (e.g. git worktree add ../' + CHANGE + '-' + task.id.replace(/[^a-z0-9]+/gi, '-') + '), do ALL work inside it, NEVER merge into the main tree, and report the worktree path in worktree_path. The host integrates and removes it.'
       : 'ISOLATION: none requested for this run — edit the repository working tree directly.',
     'TEST DISCIPLINE (token economy): run TASK-SCOPED tests first via ctx_shell — derive the test file(s) from the files this task touches (e.g. the .test.ts beside the module you edit) and run `ctx_shell bun test <that file>`; only if that passes AND the task touches shared wiring (index/entry/gate modules) run the FULL suite ONCE (`ctx_shell " + TESTCOMMAND + " | tail -20`). Never re-run the full suite repeatedly inside one task; pipe every test run through | tail -50.',
     TESTGATE
       ? 'TEST GATE: the gated suite (`' + TESTCOMMAND + '`) must pass before you report implemented — one full-suite run at the end of your task is enough if your scoped runs already passed.'
       : 'TEST GATE: not enabled for this run.',
     '',
     'Execute the task, then return {task_id, status, summary, files_touched[], worktree_path?, test_outcome?, question_for_host?, handoff?}. OMIT worktree_path unless ISOLATION was requested for this run; files_touched entries MUST be absolute paths. handoff: ≤200 words written FOR THE NEXT SUB-AGENT (the verifier for this task, then the next task\'s implementer) — to make the context immediately at reach for them: absolute paths touched + what changed in each, PLUS a look-up hint per touched file (one grep keyword/short string + the changed line range as of your last edit — prefer the keyword if unsure); decisions and why; gotchas; test state; and up to THREE ranked must-know items (1 = most critical).',
     'status "implemented" requires the task work actually done' + (TESTGATE ? ' and the gated tests passing' : '') + '.',
    ].join('\n'),
    { label: 'implement:' + task.id, phase: 'Implement', agentType: 'general-purpose', effort: 'high', model: MODELS.implementer },
  )
  let impl = parseAgentJson(implResponse, { task_id: task.id, status: 'failed', summary: String(implResponse || 'empty implementer response') })
  if (!impl || impl.status !== 'implemented') {
    // Blocker: stop dispatch immediately, ONE batched escalation (D7/ADR-0002).
    if (impl && impl.worktree_path) worktrees.push(impl.worktree_path)
    if (impl && impl.handoff) handoffLog.push('implementer/' + task.id + ': ' + String(impl.handoff).slice(0, 1200))
    phase('Escalate')
    const esc = await escalate(task, impl, null)
    // Answered-bridge normalization (run #2): the bridge may return informative statuses
    // (e.g. "fix_guidance") alongside real answers — any status carrying answers is actionable.
    if (esc.status === 'ok' || (esc && Array.isArray(esc.answers) && esc.answers.length > 0)) {
      // True resume (add-pipeline-efficiency D4): the SAME child continues with
      // everything it learned. Engine constraints: no schema/gate/effort/model
      // on a resumed call — the output is TEXT and is routed to the independent
      // verifier below (which remains a fresh spawn).
      log('Host answered — resuming task ' + task.id + ' via resume (context preserved)')
      const retry = await agentFB(
        [IMPLEMENTER_CONTRACT,
         'Assigned task: ' + task.id + ' — ' + task.description,
         'WORKING DIRECTORY: ' + (REPO_ABS || '(unknown)') + ' — absolute paths only, as before.',
         'The host resolved your blocker. Apply these decisions:',
         JSON.stringify(esc.answers || []),
         '',
         WORKTREE ? 'ISOLATION: continue in the worktree you created (report worktree_path).' : 'ISOLATION: none requested for this run.',
         TESTGATE ? 'TEST GATE: `' + TESTCOMMAND + '` must pass before reporting implemented.' : 'TEST GATE: not enabled.',
         '',
         'Finish the task now. Then reply with a SHORT TEXT summary: status, files touched (absolute paths), test outcome. Do NOT call StructuredOutput — it is not available on this resumed session.',
        ].join('\n'),
        { label: 'implement:' + task.id, resume: 'implement:' + task.id, phase: 'Implement' },
      )
      if (!retry) {
        skippedTasks.push(task.id)
        log('Task ' + task.id + ' DEFERRED (host answered but the resumed implementer returned nothing) — continuing')
        phase('Implement')
        continue
      }
      impl = { task_id: task.id, status: 'implemented', summary: String(retry).slice(0, 600), files_touched: [], handoff: '' }
      phase('Implement')
    } else if (UNANSWERED === 'fix') {
      log('Task ' + task.id + ': escalation unanswered — self-guided fix attempt (onUnansweredEscalation=fix)')
      const selffix = await agentFB(
        [IMPLEMENTER_CONTRACT,
         'Assigned task: ' + task.id + ' — ' + task.description,
         'WORKING DIRECTORY: ' + (REPO_ABS || '(unknown)') + ' — absolute paths only, as before.',
         'The escalation went UNANSWERED — no host guidance is available. Resolve the blocker yourself using your best judgment:',
         '- stay strictly within the task scope; do NOT touch specs or tasks.md;',
         '- make conservative choices that satisfy the task description and the design constraints in the PRIMER;',
         TESTGATE ? '- TEST GATE: `' + TESTCOMMAND + '` must pass before reporting implemented.' : '- TEST GATE: not enabled.',
         '',
         'Finish the task now. Then reply with a SHORT TEXT summary: status, files touched (absolute paths), test outcome. Do NOT call StructuredOutput.',
        ].join('\n'),
        { label: 'implement:' + task.id, resume: 'implement:' + task.id, phase: 'Implement' },
      )
      if (!selffix) {
        skippedTasks.push(task.id)
        log('Task ' + task.id + ' DEFERRED (self-guided fix returned nothing) — continuing')
        phase('Implement')
        continue
      }
      impl = { task_id: task.id, status: 'implemented', summary: String(selffix).slice(0, 600), files_touched: [], handoff: '' }
      phase('Implement')
    } else {
      skippedTasks.push(task.id)
      log('Task ' + task.id + ' DEFERRED (escalation unanswered) — continuing with remaining tasks')
      continue
    }
  }

  // Checkbox verifier — a DISTINCT agent; the only one allowed to edit tasks.md.
const verifResponse = await agentFB(
    [TOOL, VERIFIER_CONTRACT, '', contextBlock(), '',
     'Verify task ' + task.id + ' — ' + task.description,
     'The implementer reported: ' + JSON.stringify({ summary: impl.summary, files_touched: impl.files_touched, test_outcome: impl.test_outcome }),
     'READ DISCIPLINE (token economy): verify with GREP-ANCHORED reads, not whole files. First `ctx_grep` the changed symbols/regions (with context lines) in the files_touched entries; then read ONLY the specific line ranges you still need (read with offset/limit, or a bounded sed range via ctx_shell). Full-file reads ONLY for files under ~150 lines. Never re-read an entire large file that grep already anchored.',
     TESTGATE ? 'The gated tests (`' + TESTCOMMAND + '`) MUST be passing for verification to succeed — confirm from the reported outcome and, where feasible, by reading the affected files. Prefer a TASK-SCOPED re-run (the test file beside the touched module) over a full-suite re-run; pipe every run through | tail -50.' : '',
     'WORKING DIRECTORY: verify files under the repo root ' + (REPO_ABS || '(unknown)') + ' — use ABSOLUTE paths and confirm every files_touched entry EXISTS at its absolute path before verifying.',
     'Steps: read the implemented files yourself (never trust the report alone); check the work matches the task description;',
     'return {task_id, verified, evidence[], marked, handoff?}. evidence[] entries cite ABSOLUTE file:line, command output, or test results. handoff: ≤200 words written FOR THE NEXT SUB-AGENT (the next task\'s implementer — and the verifier re-running this task if it was deferred) — to make the context immediately at reach for them: what you verified and how (file:line anchors), look-up hints for anything the next agent will need to find (grep keyword/short string first, line range as of your last edit second), gotchas, open risks, test state, and up to THREE ranked must-know items (1 = most critical).',
     'If verification fails, set verified=false, marked=false, and blocker_reason — do NOT mark the checkbox.',
    ].join('\n'),
    { label: 'verify:' + task.id, phase: 'Implement', agentType: 'general-purpose', effort: 'medium', model: MODELS.verifier },
  )
  const verif = parseAgentJson(verifResponse, { task_id: task.id, verified: false, marked: false, evidence: ['Unparseable verifier response: ' + String(verifResponse || 'empty')] })
  if (!verif || verif.verified !== true || verif.marked !== true) {
    phase('Escalate')
    const esc = await escalate(task, impl, verif || null)
    if (esc.status === 'ok' || (esc && Array.isArray(esc.answers) && esc.answers.length > 0)) {
      // Host decided: the host's answer may be "it is actually done" (host marks
      // the checkbox itself) or new guidance. Resume verification once.
      const reverifResponse = await agentFB(
        [TOOL, VERIFIER_CONTRACT, '',
         'Re-verify task ' + task.id + ' — ' + task.description,
         'The host resolved the verification blocker. Apply these decisions:',
         JSON.stringify(esc.answers || []),
         '',
         'If the decisions confirm the work is done and you can now verify it: mark the checkbox per your contract.',
         'Return {task_id, verified, evidence[], marked}.',
        ].join('\n'),
        { label: 'verify:' + task.id + ':resumed', phase: 'Implement', agentType: 'general-purpose', effort: 'medium' },
      )
      const reverif = parseAgentJson(reverifResponse, { task_id: task.id, verified: false, marked: false, evidence: ['Unparseable resumed verifier response: ' + String(reverifResponse || 'empty')] })
      if (!reverif || reverif.verified !== true || reverif.marked !== true) {
        skippedTasks.push(task.id)
        log('Task ' + task.id + ' DEFERRED (verification still fails after host answer) — continuing')
        phase('Implement')
        continue
      }
      log('Task ' + task.id + ' verified after host decision')
      phase('Implement')
    } else if (UNANSWERED === 'fix' && !(selfFixRounds[task.id] >= 1)) {
      selfFixRounds[task.id] = 1
      log('Task ' + task.id + ': verification escalation unanswered — ONE self-guided fix round (onUnansweredEscalation=fix)')
      const fixResponse = await agentFB(
        [IMPLEMENTER_CONTRACT,
         'Assigned task: ' + task.id + ' — ' + task.description,
         'WORKING DIRECTORY: ' + (REPO_ABS || '(unknown)') + ' — absolute paths only.',
         'The verifier REJECTED the implementation and the escalation went UNANSWERED. Fix the noted problems yourself:',
         JSON.stringify({ blocker_reason: (verif && verif.blocker_reason) || null, evidence: (verif && verif.evidence) || [] }),
         '- stay strictly within the task scope; do NOT touch specs or tasks.md;',
         TESTGATE ? '- TEST GATE: `' + TESTCOMMAND + '` must pass before reporting done.' : '- TEST GATE: not enabled.',
         '',
         'Finish now. Then reply with a SHORT TEXT summary of what you changed. Do NOT call StructuredOutput.',
        ].join('\n'),
        { label: 'implement:' + task.id, resume: 'implement:' + task.id, phase: 'Implement' },
      )
      impl = { task_id: task.id, status: 'implemented', summary: String(fixResponse || '').slice(0, 600), files_touched: [], handoff: '' }
      const reverifResponse = await agentFB(
        [TOOL, VERIFIER_CONTRACT, '',
         'Re-verify task ' + task.id + ' — ' + task.description,
         'The implementer applied ONE self-guided fix: ' + JSON.stringify({ summary: impl.summary }),
         'Re-verify strictly per your contract. Mark the checkbox ONLY if the work now genuinely satisfies the task.',
         'Return {task_id, verified, evidence[], marked}.',
        ].join('\n'),
        { label: 'verify:' + task.id + ':selffix', phase: 'Implement', agentType: 'general-purpose', effort: 'medium', model: MODELS.verifier },
      )
      const reverif = parseAgentJson(reverifResponse, { task_id: task.id, verified: false, marked: false, evidence: ['Unparseable self-fix verifier response: ' + String(reverifResponse || 'empty')] })
      if (reverif && reverif.verified === true && reverif.marked === true) {
        log('Task ' + task.id + ' verified after self-guided fix')
        phase('Implement')
      } else {
        skippedTasks.push(task.id)
        log('Task ' + task.id + ' DEFERRED (still unverified after self-guided fix) — continuing')
        phase('Implement')
        continue
      }
    } else {
      skippedTasks.push(task.id)
      log('Task ' + task.id + ' DEFERRED (verification escalation unanswered) — continuing with remaining tasks')
      continue
    }
  } else {
    log('Task ' + task.id + ' verified + marked (' + (s.progress.complete + 1) + '/' + s.progress.total + ')')
    if (verif && verif.handoff) handoffLog.push('verifier/' + task.id + ': ' + String(verif.handoff).slice(0, 1200))
  }
}

// --- Phase: Report ----------------------------------------------------------
phase('Report')
const finalRaw = await agentFB(
  [TOOL, 'Final apply state: ' + ROOT + 'openspec instructions apply --change "' + CHANGE + '" --json' + STORE + ' — run the command, then reply with EXACTLY its JSON output VERBATIM inside a ```json fenced block and NOTHING else — no prose, no summary. Do NOT implement anything.'].join('\n'),
  { label: 'final:' + CHANGE, phase: 'Report', agentType: 'general-purpose', effort: 'minimal' },
)
const final = parseAgentJson(finalRaw, null)
return {
  change: CHANGE,
  state: final ? final.state : 'unknown',
  tasks_done: final ? final.progress.complete : snap.progress.complete,
  tasks_total: final ? final.progress.total : snap.progress.total,
  skipped_tasks: skippedTasks,
  worktrees,
  needs_input: skippedTasks.length ? { deferred_tasks: skippedTasks, note: 'Escalations went unanswered for these tasks — the host completes, verifies, and marks them in the main session before archive.' } : null,
  blocked_task: skippedTasks.length ? skippedTasks[0] : null,
  next: skippedTasks.length ? 'host-complete-skipped-tasks-then-archive' : 'host-review-then-archive-in-main-session',
  note: 'All actionable tasks implemented and verified; deferred tasks are listed in skipped_tasks. openspec archive (with its inline delta-spec sync) and openspec update remain main-session-only — the host runs them after review.',
}
