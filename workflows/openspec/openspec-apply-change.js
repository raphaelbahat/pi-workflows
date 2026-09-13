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
    handoff: { type: 'string', description: '≤200 words for the NEXT agent: what you did, key facts, gotchas, next-task hints' },
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
    handoff: { type: 'string', description: '≤200 words for the NEXT agent: what was verified, gotchas, next-task hints' },
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

  // Model tiers (add-pipeline-efficiency D1): flash defaults, host-overridable per run.
  const MODELS = {
    implementer: A.implementerModel || 'deepseek/deepseek-v4-flash-0731',
    verifier: A.verifierModel || 'qwen/qwen3.8-flash',
    utility: A.utilityModel || 'qwen/qwen3.8-flash',
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
  const esc = await agent(
    [TOOL,
     'You are the escalation channel for a blocked OpenSpec apply pipeline (change "' + CHANGE + '").',
     'Call the ask_user_via_host tool EXACTLY ONCE with ALL of these questions batched:',
     JSON.stringify(questions.map(function (q) { return { question: q } })),
     'Then return the bridge JSON as {status, answers}. Do NOT retry on non-ok statuses; do NOT guess answers.',
    ].join('\n'),
    { label: 'escalate:' + task.id, phase: 'Escalate', agentType: 'general-purpose', effort: 'low', model: MODELS.utility },
  )
  return parseAgentJson(esc, { status: 'error' }) || { status: 'error' }
}

// --- Phase: Load ------------------------------------------------------------
phase('Load')
const snapRaw = await agent(
  [TOOL,
   'Load the apply state for change "' + CHANGE + '" WITHOUT modifying anything.',
   'Run: ' + ROOT + 'openspec instructions apply --change "' + CHANGE + '" --json' + STORE,
   'Return the snapshot: state, change_dir, progress, tasks[] (id, description, done), missing_artifacts,',
   'and a 10-line excerpt of the instruction string. Do NOT implement anything.',
   'STATE MAPPING (verbatim from the payload): "ready" when progress.remaining > 0; "all_done" when no incomplete tasks remain; "blocked" ONLY when the payload itself reports it with non-empty missingArtifacts. Never infer blocked from anything else.',
  ].join('\n'),
  { label: 'load:' + CHANGE, phase: 'Load', agentType: 'general-purpose', effort: 'medium', model: MODELS.utility },
)
const snap = parseAgentJson(snapRaw, null)
if (!snap) {
  return { change: CHANGE, error: 'load-failed', note: 'load agent returned unparseable output — re-run resumes idempotently (checkboxes are the state)' }
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
  const primerResponse = await agent(
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
const MAX_ITERATIONS = (snap.progress.total || 0) + 4 // every task + re-queries; hard runaway backstop
while (guard++ < MAX_ITERATIONS) {
  // Re-query per dispatch: the CLI checkbox progress is authoritative (D4).
  const s = guard === 1 ? snap : parseAgentJson(await agent(
    [TOOL, 'Re-run: ' + ROOT + 'openspec instructions apply --change "' + CHANGE + '" --json' + STORE + ' — return the snapshot only (state, progress, tasks[]). Map the payload\'s "state" field VERBATIM ("ready" when progress.remaining > 0; "all_done" when none; "blocked" only if the payload itself says so). Do NOT implement anything.'].join('\n'),
    { label: 'status:' + CHANGE + ':' + guard, phase: 'Implement', agentType: 'general-purpose', effort: 'minimal' },
  ), null)
  if (!s) {
    return { change: CHANGE, error: 'status-failed', progress: snap.progress, note: 'status agent returned null — re-run resumes idempotently (checkboxes are the state)' }
  }
  if (s.state === 'blocked' && (s.missing_artifacts || []).length > 0) { // blocked requires missingArtifacts per the documented shape — an agent misread otherwise
    return { change: CHANGE, error: 'blocked', missing_artifacts: s.missing_artifacts || [], progress: s.progress, next: 'host-complete-planning' }
  }
  const task = (s.tasks || []).find(function (t) { return !t.done })
  if (!task) break // every task complete and verified — Report
  log('Task ' + task.id + ': dispatching implementer')

  // Implementer (effort high). Distinct from the verifier by design (ADR-0002).
const implResponse = await agent(
    [TOOL, IMPLEMENTER_CONTRACT, '', contextBlock(), '',
     'Assigned task: ' + task.id + ' — ' + task.description,
     'WORKING DIRECTORY: ' + (REPO_ABS || '(unknown — ask the host)') + ' — EVERY file you create or edit MUST use an ABSOLUTE path under that root. Relative paths resolve against a DIFFERENT session cwd and land in the wrong repository (observed failure).',
     'TOOL ROUTING: prefer ctx_grep/ctx_shell over read/bash for searches and bulk reads — they return compressed receipts. If ctx_* tools are not available in this session, FALLBACK to context_search/context_get (the pi-context sidecar) for the same job; plain read/bash are the last resort. Plain read ONLY for files under ~150 lines you must see in full; pipe test runs through | tail -50. Do NOT re-read design.md — the PRIMER covers it; re-read a section only when the primer is insufficient for your task.',
     WORKTREE
       ? 'ISOLATION: create a task-scoped git worktree (e.g. git worktree add ../' + CHANGE + '-' + task.id.replace(/[^a-z0-9]+/gi, '-') + '), do ALL work inside it, NEVER merge into the main tree, and report the worktree path in worktree_path. The host integrates and removes it.'
       : 'ISOLATION: none requested for this run — edit the repository working tree directly.',
     'TEST DISCIPLINE (token economy): run TASK-SCOPED tests first via ctx_shell — derive the test file(s) from the files this task touches (e.g. the .test.ts beside the module you edit) and run `ctx_shell bun test <that file>`; only if that passes AND the task touches shared wiring (index/entry/gate modules) run the FULL suite ONCE (`ctx_shell " + TESTCOMMAND + " | tail -20`). Never re-run the full suite repeatedly inside one task; pipe every test run through | tail -50.',
     TESTGATE
       ? 'TEST GATE: the gated suite (`' + TESTCOMMAND + '`) must pass before you report implemented — one full-suite run at the end of your task is enough if your scoped runs already passed.'
       : 'TEST GATE: not enabled for this run.',
     '',
     'Execute the task, then return {task_id, status, summary, files_touched[], worktree_path?, test_outcome?, question_for_host?, handoff?}. OMIT worktree_path unless ISOLATION was requested for this run; files_touched entries MUST be absolute paths. handoff: ≤200 words for the NEXT agent — what you did, key facts, gotchas, next-task hints.',
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
    if (esc.status === 'ok') {
      // True resume (add-pipeline-efficiency D4): the SAME child continues with
      // everything it learned. Engine constraints: no schema/gate/effort/model
      // on a resumed call — the output is TEXT and is routed to the independent
      // verifier below (which remains a fresh spawn).
      log('Host answered — resuming task ' + task.id + ' via resume (context preserved)')
      const retry = await agent(
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
        return {
          change: CHANGE, error: 'blocker-unresolved', blocked_task: task.id,
          needs_input: { task: task.id, escalation: esc, note: 'The resumed implementer returned nothing. No checkbox was marked.' },
          progress: s.progress, next: 'host-decide-then-resume',
        }
      }
      impl = { task_id: task.id, status: 'implemented', summary: String(retry).slice(0, 600), files_touched: [], handoff: '' }
      phase('Implement')
    } else {
      return {
        change: CHANGE, error: 'escalation-failed', blocked_task: task.id,
        needs_input: { task: task.id, escalation: esc, note: 'No checkbox was marked for the blocked task; the host decides, then re-invokes (checkboxes are the state, so nothing is lost).' },
        progress: s.progress, next: 'host-decide-then-resume',
      }
    }
  }

  // Checkbox verifier — a DISTINCT agent; the only one allowed to edit tasks.md.
const verifResponse = await agent(
    [TOOL, VERIFIER_CONTRACT, '', contextBlock(), '',
     'Verify task ' + task.id + ' — ' + task.description,
     'The implementer reported: ' + JSON.stringify({ summary: impl.summary, files_touched: impl.files_touched, test_outcome: impl.test_outcome }),
     'READ DISCIPLINE (token economy): verify with GREP-ANCHORED reads, not whole files. First `ctx_grep` the changed symbols/regions (with context lines) in the files_touched entries; then read ONLY the specific line ranges you still need (read with offset/limit, or a bounded sed range via ctx_shell). Full-file reads ONLY for files under ~150 lines. Never re-read an entire large file that grep already anchored.',
     'Verify task ' + task.id + ' — ' + task.description,
     'The implementer reported: ' + JSON.stringify({ summary: impl.summary, files_touched: impl.files_touched, test_outcome: impl.test_outcome }),
     'TOOL ROUTING: prefer ctx_grep/ctx_shell over read/bash for searches — compressed receipts. Use ctx_expand for prior large outputs instead of re-reading files. If ctx_* tools are not available in this session, FALLBACK to context_search/context_get (the pi-context sidecar) for the same job; plain read/bash are the last resort.',
     TESTGATE ? 'The gated tests (`' + TESTCOMMAND + '`) MUST be passing for verification to succeed — confirm from the reported outcome and, where feasible, by reading the affected files. Prefer a TASK-SCOPED re-run (the test file beside the touched module) over a full-suite re-run; pipe every run through | tail -50.' : '',
     'WORKING DIRECTORY: verify files under the repo root ' + (REPO_ABS || '(unknown)') + ' — use ABSOLUTE paths and confirm every files_touched entry EXISTS at its absolute path before verifying.',
     'Steps: read the implemented files yourself (never trust the report alone); check the work matches the task description;',
     'return {task_id, verified, evidence[], marked, handoff?}. evidence[] entries cite ABSOLUTE file:line, command output, or test results. handoff: ≤200 words for the NEXT agent — what was verified, gotchas, next-task hints.',
     'If verification fails, set verified=false, marked=false, and blocker_reason — do NOT mark the checkbox.',
    ].join('\n'),
    { label: 'verify:' + task.id, phase: 'Implement', agentType: 'general-purpose', effort: 'medium', model: MODELS.verifier },
  )
  const verif = parseAgentJson(verifResponse, { task_id: task.id, verified: false, marked: false, evidence: ['Unparseable verifier response: ' + String(verifResponse || 'empty')] })
  if (!verif || verif.verified !== true || verif.marked !== true) {
    phase('Escalate')
    const esc = await escalate(task, impl, verif || null)
    if (esc.status === 'ok') {
      // Host decided: the host's answer may be "it is actually done" (host marks
      // the checkbox itself) or new guidance. Resume verification once.
      const reverifResponse = await agent(
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
        return {
          change: CHANGE, error: 'verification-unresolved', blocked_task: task.id,
          needs_input: { task: task.id, escalation: esc, note: 'Verification still fails after the host answered. No checkbox was marked.' },
          progress: s.progress, next: 'host-decide-then-resume',
        }
      }
      log('Task ' + task.id + ' verified after host decision')
      phase('Implement')
    } else {
      return {
        change: CHANGE, error: 'escalation-failed', blocked_task: task.id,
        needs_input: { task: task.id, escalation: esc, note: 'No checkbox was marked for the blocked task; the host decides, then re-invokes.' },
        progress: s.progress, next: 'host-decide-then-resume',
      }
    }
  } else {
    log('Task ' + task.id + ' verified + marked (' + (s.progress.complete + 1) + '/' + s.progress.total + ')')
  if (verif && verif.handoff) handoffLog.push('verifier/' + task.id + ': ' + String(verif.handoff).slice(0, 1200))
  }
}

// --- Phase: Report ----------------------------------------------------------
phase('Report')
const finalRaw = await agent(
  [TOOL, 'Final apply state: ' + ROOT + 'openspec instructions apply --change "' + CHANGE + '" --json' + STORE + ' — return the snapshot only. Do NOT implement anything.'].join('\n'),
  { label: 'final:' + CHANGE, phase: 'Report', agentType: 'general-purpose', effort: 'minimal' },
)
const final = parseAgentJson(finalRaw, null)
return {
  change: CHANGE,
  state: final ? final.state : 'unknown',
  tasks_done: final ? final.progress.complete : snap.progress.complete,
  tasks_total: final ? final.progress.total : snap.progress.total,
  worktrees,
  needs_input: null,
  blocked_task: null,
  next: 'host-review-then-archive-in-main-session',
  note: 'All tasks implemented and verified. openspec archive (with its inline delta-spec sync) and openspec update remain main-session-only — the host runs them after review.',
}
