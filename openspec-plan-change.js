export const meta = {
  name: 'openspec-plan-change',
  description:
    'Schema-driven OpenSpec authoring for ONE change: resolve the artifact graph via the CLI, author the next ready artifact from its template/instruction, QA it, and report. Modes: scaffold (create + first instructions, no write) | one (default; author exactly one artifact). Ambiguities go through the checkpoint-bridge ask_user_via_host tool; without the bridge the workflow returns structured needs_input instead of guessing. Never applies, never archives.',
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
const ROOT = A.repoRoot ? 'cd ' + A.repoRoot + ' && ' : ''
const STORE = A.store ? ' --store ' + A.store : ''
if (!CHANGE) {
  throw new Error('args.change is required — the kebab-case change name')
}
if (MODE !== 'one' && MODE !== 'scaffold') {
  throw new Error(
    "args.mode must be 'one' or 'scaffold' — 'apply-ready' authoring is gated behind a measured pilot (ADR-0001); ask the host session to run it manually for now",
  )
}
log('plan-change: ' + CHANGE + ' | mode: ' + MODE)

// --- Phase: Resolve ---------------------------------------------------------
phase('Resolve')
const snap = await agent(
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
  ].join('\n'),
  { label: 'resolve:' + CHANGE, phase: 'Resolve', agentType: 'general-purpose', effort: 'minimal', schema: GRAPH_SCHEMA },
)
if (!snap) {
  return { change: CHANGE, mode: MODE, error: 'resolve-failed' }
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
const target = readyArtifacts[0]
log('Authoring artifact: ' + target.id + ' (of ' + readyArtifacts.length + ' ready)')

// --- Phase: Author ----------------------------------------------------------
const GRILL = [
  'CHECKPOINT RULE (human authority): if material scope is genuinely unknown — an ambiguity whose answer would change',
  'what you write — call the ask_user_via_host tool ONCE with ALL your questions batched (it relays to the human via the',
  'checkpoint-bridge). If ask_user_via_host returns status "ok", use the answers. For ANY other status (no-host, timeout,',
  'timeout-or-cancelled, cancelled, error) DO NOT guess and DO NOT retry: return action "needs_input" with the',
  'question field stating exactly what the host session must decide.',
].join('\n')

const written = await agent(
  [
    TOOL,
    CONTRACT,
    GRILL,
    '',
    'Assign artifact: ' + target.id + ' (change "' + CHANGE + '").',
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
  { label: 'author:' + target.id, phase: 'Author', agentType: 'general-purpose', effort: 'high', schema: WRITE_SCHEMA },
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

// --- Phase: QA --------------------------------------------------------------
const qa = await agent(
  [
    TOOL,
    'QA pass for artifact ' + target.id + ' at ' + (written.path || 'its resolvedOutputPath') + ' (change "' + CHANGE + '").',
    'READ the file, then check and FIX IN PLACE only mechanical defects:',
    '- every template section present and non-empty;',
    '- no leaked CLI payloads: "context": or "rules": JSON fragments or <placeholders> left verbatim;',
    '- dependency artifacts actually cited where decisions reference them;',
    '- RFC-2119 keyword presence in requirement lines; four-hash #### scenario headings.',
    'Then run: ' + ROOT + 'openspec validate "' + CHANGE + '" --type change --strict' + STORE,
    '  (a partial plan may legitimately fail because LATER artifacts are missing — report that as ok=true with a note',
    '   in fixes, e.g. "strict-fail expected mid-planning: <first error line>", unless the failure names THIS artifact).',
    'If the failure names THIS artifact, fix the wording in this file only and re-run the validate once.',
    'Return {id, ok, fixes[]} — fixes = one line per correction made (empty if none).',
  ].join('\n'),
  { label: 'qa:' + target.id, phase: 'QA', agentType: 'general-purpose', effort: 'medium', schema: QA_SCHEMA },
)

return {
  change: CHANGE,
  mode: MODE,
  schema_name: snap.schema_name,
  written: [{ id: target.id, path: written.path, assumption: written.assumption || null }],
  qa_ok: qa ? qa.ok === true : null,
  qa_fixes: qa ? qa.fixes : [],
  needs_input: null,
  remaining_ready: readyArtifacts.length - 1,
  planning_complete: snap.planning_complete,
  next: 'host-review-then-continue',
}
