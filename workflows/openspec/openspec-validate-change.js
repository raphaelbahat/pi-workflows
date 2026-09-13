export const meta = {
  name: 'openspec-validate-change',
  description:
    'Read-only validation sweep for one OpenSpec change: parallel schema-d reviewer dimensions (completeness, correctness, coherence, unbiased) plus a strict CLI gate, composed into a CRITICAL/WARNING/SUGGESTION scorecard. Never edits artifacts; findings return to the host session.',
  phases: [
    { title: 'Load', detail: 'snapshot the change: artifacts, tasks, schema (read-only CLI)' },
    { title: 'Review', detail: 'four parallel read-only reviewers with evidence-URL verdicts' },
    { title: 'Gate', detail: 'openspec validate --type change --strict' },
    { title: 'Compose', detail: 'one agent writes the scorecard report' },
  ],
}

const TOOL = [
  'TOOL DISCIPLINE: issue at most ONE tool call per message; never batch two or more tool calls in a single turn.',
  'If a tool call is rejected as malformed, silently re-issue that ONE call cleanly. Never restate or quote tool-call markup as text.',
  'End by calling StructuredOutput exactly once with the required object — do not answer in prose instead.',
].join('\n')

const CONTRACT = [
  'READ-ONLY CONTRACT: you never create, modify, or delete any file. You validate and report only.',
  'The openspec CLI is the source of truth for the change graph. Read-only verbs you may run via shell:',
  '  openspec show <change> --json   |  openspec list --json  |  openspec validate <change> --type change',
  'Never run: new change, archive, update, or any command that writes.',
  'Severity discipline (verify recipe): CRITICAL only for blocking defects (missing required artifact or section,',
  'a requirement with no text, a factually wrong claim WITH evidence). WARNING for drift or coherence gaps.',
  'SUGGESTION for polish. When unsure, prefer the softer severity.',
  'Evidence rule: every issue must carry evidence entries — "file:<path>", "cli:<command>:<excerpt>", or "url:<url>".',
  'A factual claim you could NOT verify must be reported as severity SUGGESTION with evidence ["uncertain"].',
].join('\n')

const SNAPSHOT_SCHEMA = {
  type: 'object',
  properties: {
    change: { type: 'string' },
    schema_name: { type: 'string' },
    change_root: { type: 'string' },
    artifacts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          path: { type: 'string' },
          exists: { type: 'boolean' },
          one_line: { type: 'string' },
        },
        required: ['id', 'path', 'exists'],
      },
    },
    tasks: {
      type: 'object',
      properties: { total: { type: 'number' }, done: { type: 'number' } },
      required: ['total', 'done'],
    },
    capabilities_declared: { type: 'array', items: { type: 'string' } },
    skip_specs: { type: 'boolean' },
  },
  required: ['change', 'schema_name', 'change_root', 'artifacts', 'tasks'],
}

const ISSUES_SCHEMA = {
  type: 'object',
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['CRITICAL', 'WARNING', 'SUGGESTION'] },
          file: { type: 'string' },
          section: { type: 'string' },
          claim: { type: 'string' },
          evidence: { type: 'array', items: { type: 'string' } },
          suggested_fix: { type: 'string' },
        },
        required: ['severity', 'file', 'claim', 'evidence'],
      },
    },
    checked_claims: { type: 'number' },
  },
  required: ['issues', 'checked_claims'],
}

const GATE_SCHEMA = {
  type: 'object',
  properties: {
    cli_ok: { type: 'boolean' },
    command: { type: 'string' },
    output_excerpt: { type: 'string' },
  },
  required: ['cli_ok', 'command', 'output_excerpt'],
}

// Defensive args parse: the args transport may deliver a JSON-encoded string.
const A = (typeof args === 'string') ? JSON.parse(args) : (args || {})
const CHANGE = A.change
// Model tiers (add-pipeline-efficiency D1): flash defaults, host-overridable per run.
const MODELS = {
  verifier: A.verifierModel || 'qwen/qwen3.8-flash',
  utility: A.utilityModel || 'qwen/qwen3.8-flash',
}
const ROOT = A.repoRoot ? 'cd ' + A.repoRoot + ' && ' : ''
const REPORT = A.reportFile || '.openspec-reports/openspec-validate-report-' + (CHANGE || 'change') + '.md'
if (!CHANGE) {
  throw new Error('args.change is required — the kebab-case name of an active OpenSpec change')
}
log('Validating change: ' + CHANGE + (A.repoRoot ? ' (root: ' + A.repoRoot + ')' : ''))

const DIMENSIONS = [
  {
    id: 'completeness',
    lens:
      'COMPLETENESS: every artifact the schema requires exists and is non-empty; each artifact fills every section its template defines; tasks.md checkboxes are syntactically coherent and consistent with the count of tasks; requirements have text; scenario blocks use four-hash #### headings. Missing sections or empty stubs are CRITICAL.',
  },
  {
    id: 'correctness',
    lens:
      'CORRECTNESS: verify FACTUAL claims made in the artifacts against live sources — the repo files they reference, CLI help output (e.g. openspec <verb> --help), and documentation. You are checking whether the world actually is as the artifacts say. A wrong factual claim with evidence is CRITICAL; an unverifiable claim is SUGGESTION with evidence ["uncertain"].',
  },
  {
    id: 'coherence',
    lens:
      'COHERENCE: the artifacts agree with each other — proposal scope matches design decisions, design matches tasks, ADR outcomes match what design/tasks assume, no artifact contradicts another, no orphan references to sections or artifacts that do not exist. Contradictions are WARNING (CRITICAL if they change scope).',
  },
  {
    id: 'unbiased',
    lens:
      'UNBIASED: you carry NO prioritization lens beyond the shared contract. Sweep everything once for defects the other dimensions might have framed away: stale references, invented CLI flags or file paths, artifacts that answer a question nobody asked, scope items mentioned in one artifact only.',
  },
]

function reviewerPrompt(dim, snap) {
  return [
    'You are one read-only reviewer dimension in an OpenSpec change validation sweep.',
    'TOOL ROUTING (hard rule): every command via ctx_shell, every content search via ctx_grep, file reads via ctx_read or bounded ranges — NEVER native bash/grep/read for covered operations. Sole exception: the ctx tool returns "not found" — fall back to the native tool and SAY SO in your final report. Pipe test runs through | tail -50.',
    'CHANGE: ' + CHANGE,
    dim.lens,
    '',
    CONTRACT,
    '',
    'CHANGE SNAPSHOT (authoritative inventory; artifacts at ' + (snap.change_root || 'the change directory') + '):',
    JSON.stringify(snap),
    '',
    'METHOD: read each existing artifact file once (never re-read). Cross-check claims per your dimension.',
    'You may run READ-ONLY shell commands (' + ROOT.trim() + 'openspec ...) to verify facts against the CLI itself.',
    'Report at least one pass over every existing artifact. An empty issues array is a valid result only if checked_claims > 0.',
  ].join('\n')
}

// --- Phase: Load -----------------------------------------------------------
phase('Load')
const snap = await agent(
  [
    TOOL,
    CONTRACT,
    'Snapshot the OpenSpec change "' + CHANGE + '" WITHOUT modifying anything.',
    'Run: ' + ROOT + 'openspec show "' + CHANGE + '" --json  (if it fails, fall back to reading openspec/changes/' + CHANGE + '/ directly).',
    'Also run: ' + ROOT + 'openspec status --change "' + CHANGE + '" --json if available.',
    'List every artifact file with id, absolute path, existence, and a one-line summary of its content.',
    'Count tasks.md checkboxes: total and done. Note whether the change declares capabilities or sets skip_specs.',
    'Return the snapshot object. Do NOT read the full content of artifacts — later agents do that.',
  ].join('\n'),
  { label: 'snapshot:' + CHANGE, phase: 'Load', agentType: 'general-purpose', effort: 'minimal', model: MODELS.utility, schema: SNAPSHOT_SCHEMA },
)
if (!snap) {
  return { change: CHANGE, error: 'load-failed', note: 'snapshot agent returned null — check the change name and repo root' }
}
const existing = snap.artifacts.filter(function (a) { return a.exists })
log('Snapshot: ' + existing.length + ' artifacts, tasks ' + snap.tasks.done + '/' + snap.tasks.total + ', schema ' + snap.schema_name)

// --- Phase: Review ---------------------------------------------------------
const reviews = await parallel(
  DIMENSIONS.map(function (dim) {
    return function () {
      return agent(reviewerPrompt(dim, snap), {
        label: 'review:' + dim.id,
        phase: 'Review',
        agentType: 'general-purpose',
        effort: 'high',
        model: MODELS.verifier,
        schema: ISSUES_SCHEMA,
      })
    }
  }),
)

const issues = []
const failedDimensions = []
let checkedClaims = 0
for (let i = 0; i < DIMENSIONS.length; i++) {
  const r = reviews[i]
  if (r && Array.isArray(r.issues)) {
    checkedClaims += r.checked_claims || 0
    for (const issue of r.issues) issues.push({ dimension: DIMENSIONS[i].id, ...issue })
  } else {
    failedDimensions.push(DIMENSIONS[i].id)
  }
}
log('Review done: ' + issues.length + ' issues from ' + (DIMENSIONS.length - failedDimensions.length) + '/' + DIMENSIONS.length + ' dimensions' + (failedDimensions.length ? ' (failed: ' + failedDimensions.join(', ') + ')' : ''))

// --- Phase: Gate -----------------------------------------------------------
const gate = await agent(
  [
    TOOL,
    'Run the strict CLI gate for change "' + CHANGE + '" and report the result verbatim.',
    'Run exactly: ' + ROOT + 'openspec validate "' + CHANGE + '" --type change --strict',
    'Record the exit code (0 = pass, 1 = failures) and an excerpt of stdout+stderr (last 60 lines max).',
    'If the command itself cannot run (no openspec binary, wrong root), set cli_ok=false, command="(unavailable)", and explain in output_excerpt.',
    'Do NOT fix anything. Do NOT run any other command.',
  ].join('\n'),
  { label: 'gate:' + CHANGE, phase: 'Gate', agentType: 'general-purpose', effort: 'low', model: MODELS.utility, schema: GATE_SCHEMA },
)
const cliOk = gate ? gate.cli_ok === true : false
log('Gate: ' + (gate ? (cliOk ? 'PASS' : 'FAIL') : 'gate agent failed') + (gate ? ' — ' + gate.command : ''))

// --- Phase: Compose --------------------------------------------------------
phase('Compose')
const critical = issues.filter(function (i) { return i.severity === 'CRITICAL' })
const warnings = issues.filter(function (i) { return i.severity === 'WARNING' })
const suggestions = issues.filter(function (i) { return i.severity === 'SUGGESTION' })
const readyToArchive = cliOk && critical.length === 0 && failedDimensions.length === 0

const composeSummary = await agent(
  [
    TOOL,
    'You are composing a validation scorecard report for OpenSpec change "' + CHANGE + '".',
    'Write the report to: ' + REPORT + ' (create parent directories if needed; OVERWRITE if present).',
    'Report structure — atomic bullets and tables only, no prose walls:',
    '# Validation Report — ' + CHANGE,
    '## Verdict — ready_to_archive: ' + readyToArchive + ' | CLI strict gate: ' + (gate ? (cliOk ? 'PASS' : 'FAIL') : 'AGENT FAILED') + ' | reviewers failed: ' + (failedDimensions.join(', ') || 'none'),
    '## Issues by severity — one table per level (CRITICAL / WARNING / SUGGESTION):',
    '  | Dimension | File | Claim | Evidence | Suggested fix |',
    '  If a level has no issues, write "(none)".',
    '## Method — four parallel read-only reviewer dimensions + strict CLI gate; ' + checkedClaims + ' claims checked; severity discipline: softer when unsure; unverified claims reported as uncertain.',
    '',
    'ISSUES JSON (complete and authoritative):',
    JSON.stringify({ critical: critical, warnings: warnings, suggestions: suggestions }),
    'GATE RESULT JSON:',
    JSON.stringify(gate || { cli_ok: false, command: '(gate agent failed)', output_excerpt: '' }),
    '',
    'After the single write call, call no further tools except StructuredOutput — return a text summary under 150 words: verdict, counts per severity, the single most important finding if any.',
  ].join('\n'),
  { label: 'compose:' + CHANGE, phase: 'Compose', agentType: 'general-purpose', effort: 'high', model: MODELS.utility },
)

return {
  change: CHANGE,
  cli_ok: cliOk,
  ready_to_archive: readyToArchive,
  critical: critical.length,
  warnings: warnings.length,
  suggestions: suggestions.length,
  checked_claims: checkedClaims,
  failed_dimensions: failedDimensions,
  issues: issues,
  report_path: REPORT,
  compose_summary: composeSummary,
}
