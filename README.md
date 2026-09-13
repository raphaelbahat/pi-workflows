# pi-workflows

Reusable, args-driven [pi-subagents](https://github.com/tintinweb/pi-subagents) workflows.
Distributed to projects via the Skillshare global extras `pi-workflows-openspec` and
`pi-workflows-plugins` (sources = this repo's `workflows/` family dirs, mode = **copy**, files
land flat by basename at `<project>/.pi/workflows/` — the resolver scans non-recursively).

## Files

| Workflow | Purpose |
|---|---|
| `workflows/pi-plugin/pi-plugin-eval.js` | One high-effort research agent per plugin reads ALL provided URLs and writes a structured report; per-report QA verifier; `gate` on report existence; skip-if-report-exists (idempotent re-runs) |
| `workflows/pi-plugin/pi-plugin-comparison.js` | Context-safe two-stage synthesis: parallel digest agents (shards) extract totals/strengths/weaknesses/families, one composer writes the ranked comparison |
| `workflows/pi-plugin/pi-plugin-stack-advisor.js` | 4 persona-lensed advisors + 1 unbiased propose complementary, non-conflicting plugin stacks; synthesizer merges them |
| `workflows/pi-plugin/pi-plugin-pipeline.js` | Orchestrator: eval → comparison → (optional, `args.stack`) stack recommendations |
| `workflows/openspec/openspec-validate-change.js` | Read-only validation sweep for one OpenSpec change: 4 parallel reviewer dimensions (completeness/correctness/coherence/unbiased) + strict CLI gate → CRITICAL/WARNING/SUGGESTION scorecard report |
| `workflows/openspec/openspec-plan-change.js` | Schema-driven authoring for one change: resolve graph via CLI, author the first ready artifact from its template, QA. Modes: `scaffold`\|`one`\|`apply-ready` (loop to planning-complete, capped by `maxArtifacts`). Grill via the checkpoint-bridge `ask_user_via_host` tool; `needs_input` fallback. Never applies/archives |
| `workflows/openspec/openspec-apply-change.js` | Per-task implementation pipeline: Load (`instructions apply --json` + secret-free `pi --list-models` discovery, fail-fast on blocked) → per task an implementer agent + a SEPARATE checkbox-verifier agent → ONE batched bridge escalation on the first blocker (configurable unanswered-escalation policy) → Report. `worktree`/`testGate` optional, default off. Never archives/updates |
| `workflows/openspec/openspec-campaign.js` | Campaign orchestrator for N independent changes: serial `openspec new change` scaffolding (global-mutating, never parallelized), one-level `workflow('openspec-plan-change')` fan-out (proposals-only default), per-item outcome tracking, `CAMPAIGN.md` digest. Never applies/archives/updates |
| `workflows/openspec/openspec-apply-campaign.js` | Serial apply of ALL unimplemented changes in a host-provided dependency order: per change runs `openspec-apply-change` (idempotent — checkboxes are the state), fail-soft per change, host-handoff digest. `onUnansweredEscalation` passthrough. No commits, no archive |
| `extensions/checkpoint-bridge/` | pi extension (not a workflow): relays sub-agent `ask_user_via_host` calls over a process-global bus to the main session's UI — the ADR-0001 checkpoint channel (pi.events proved session-scoped; see the ADR amendment). Published to npm as `pi-checkpoint-bridge`; **required for all `workflows/openspec/` authoring/apply workflows** |
| `scripts/check-workflow-syntax.mjs` | CI gate: `node --check` on every workflow script (runs in prek + GitHub Actions) |
| `scripts/analyze-subagent-transcripts.mjs` | Deterministic transcript diagnostics: aggregate tool distribution, per-session token totals (replay-inclusive), context hogs (largest tool results), loop signatures (identical tool+args ≥5×), ctx_* adoption. Usage: `node scripts/analyze-subagent-transcripts.mjs [sessionsDir] [--days N] [--top N]` |

## Runtime disciplines (every child prompt)

The shared `TOOL` block injected into every child agent enforces, in order:

1. **One tool call per message** — never batch two or more.
2. **3-strike malformed-call cap** — a rejected call is re-issued cleanly at most 3 times, then
   the child returns its best-effort text. This killed the production loop class (a glm-5.3-flash
   status child re-emitted a degenerate `StructuredOutput` 2,064×).
3. **SHELL & SEARCH hard rule** — every command via `ctx_shell`, every content search via
   `ctx_grep`, file reads via `ctx_read`/bounded ranges; native `bash`/`grep`/whole-file `read`
   only when the ctx tool is not found, and the child MUST say so in its final summary.
4. **CTX timing note** — a `not found` ctx tool may be pre-registration (the lean-ctx bridge
   connects asynchronously); use the native fallback and retry the ctx tool after a few turns.
5. **One final answer** — `StructuredOutput` exactly once when available, else plain text
   (raw JSON is fine).

Token-economy disciplines layered on top: a **context primer** (one design/spec distillation
per run, inline in every implementer/verifier prompt — never a file reference), **handoffs
written FOR THE NEXT SUB-AGENT** (named next role, absolute paths + what changed, decisions
and why, gotchas, test state, THE one thing to know first), **task-scoped test runs**
(`ctx_shell bun test <touched test file>` first; the full suite once), and **grep-anchored
verifier reads** (whole-file reads only under ~150 lines).

## Escalation policy (`openspec-apply-change`)

- ONE batched `ask_user_via_host` on the first blocker; any bridge status **carrying answers**
  is actionable (`fix_guidance` with answers counts — statuses are taken verbatim from the bridge).
- `onUnansweredEscalation` (host-configurable, campaign-forwarded):
  - `defer` (default) — the task goes to `skipped_tasks`, the loop continues, the final report
    lists deferred tasks for the host (`host-complete-skipped-tasks-then-archive`).
  - `fix` — ONE bounded self-guided fix round per task: the implementer resumes with best
    judgment (strict task scope, no specs/tasks.md edits), then a FRESH verifier re-gates the
    checkbox. Still failing → deferred. `selfFixRounds` hard-bounds one round per task.
- The implementer never marks checkboxes; only the separate verifier agent does, and only for
  its own task (ADR-0002). The CLI checkbox state re-queried per dispatch is the only truth.

## Model tiers + cross-provider fallback (ADR-0003)

| Role | Primary (host-overridable) | Effort | Fallback chain |
|---|---|---|---|
| implementer | `deepseek/deepseek-v4-flash-0731` | high | `qwen3.8-flash` → `glm-5.3-flash` |
| verifier | `qwen/qwen3.8-flash` | medium | `deepseek-v4-flash` → `glm-5.3-flash` |
| utility (load/primer/status/final) | `qwen/qwen3.8-flash` | low–medium | `deepseek-v4-flash` → `glm-5.3-flash` |
| author (plan) | `qwen/qwen3.8-flash` | high | same chain logic |

`agentFB` wraps every child `agent()` call: when the primary resolves to `null` (terminal
provider error — pi-subagents already retried transient failures internally, e.g. OpenRouter
shared-pool `429`), the SAME call is retried down the chain, each hop logged as
`fallback hop: agent "<label>" returned null on <model> — retrying on: <next>`. Fallback hops
drop `resume`/`gate` (fresh child; prompts are self-contained by construction). The apply Load
phase discovers configured models via `pi --list-models` (secret-free — never `auth.json`/
`models.json`) and `agentFB` filters chains to that list; absent discovery is logged and
non-blocking. Unknown host primaries get the default chain minus the primary.

## Args contracts

### pi-plugin-eval
- `plugins` **(required)** — array of `{slug?, package, urls[], notes?}` records,
  bare npm package names (`"pi-safe-compact"`), or URLs (npm/GitHub/pi.dev — parsed automatically)
- `outDir` — report output directory (default `plugin-reports`)
- `focus` — evaluation lens (default: general quality as a Pi coding-agent plugin)

### pi-plugin-comparison
- `reportsDir` — directory of evaluation reports (default `plugin-reports`)
- `slugs` — optional array of report filenames without `.md`; omitted → a discovery agent lists the directory
- `outputFile` — default `COMPARISON.md`
- `shardSize` — reports per digest agent (default 9)
- `focus` — sweep focus carried into Method Notes

### pi-plugin-stack-advisor
- `comparisonFile` — the comparison document to read (default `plugin-reports/COMPARISON.md`)
- `reportsDir` — optional, for per-plugin report verification by advisors
- `outputFile` — default `STACK-RECOMMENDATIONS.md`
- `personas` — optional `[{id, lens}]` override; defaults: hands-off, cost, clever, minimal-risk, unbiased

### pi-plugin-pipeline
- `plugins`, `outDir`, `focus` — as eval
- `comparisonFile`, `stackOutputFile` — output names
- `stack` — set truthy to also run the stack advisor

### openspec-validate-change
- `change` **(required)** — kebab-case name of an active OpenSpec change
- `repoRoot` — absolute path to the repo holding the change (default: the agents' cwd)
- `reportFile` — scorecard output path (default `.openspec-reports/openspec-validate-report-<change>.md`)
- `verifierModel` / `utilityModel` — model overrides; all child calls are `agentFB`-wrapped
- Read-only: reviewers never edit artifacts; findings return to the host session

### openspec-plan-change
- `change` **(required)** — kebab-case change name
- `mode` — `one` (default: author exactly the first `ready` artifact), `scaffold` (create + report first instructions, no write), or `apply-ready` (loop resolve→author→QA until every planning artifact is `done`/`skipped`)
- `maxArtifacts` — apply-ready cap per run (default 12); the return names remaining artifacts so a later run resumes idempotently
- `authorModel` / `utilityModel` — flash-tier defaults (`qwen/qwen3.8-flash`; author @ `high`, utility @ `low`) — promote per run for demanding artifacts; all calls `agentFB`-wrapped
- `intent` — optional host-authored brief for the author agent
- `repoRoot`, `store` — repo root for the CLI; store id appended as `--store`
- Requires the checkpoint-bridge extension: if `ask_user_via_host` is absent, the run returns a friendly `checkpoint-bridge-not-installed` error instead of authoring (install: `pi install npm:pi-checkpoint-bridge`)

### openspec-apply-change
- `change` **(required)** — kebab-case name of a planning-complete change
- `implementerModel` / `verifierModel` / `utilityModel` — flash-tier defaults (see the tiers table above); promote per run for demanding tasks
- `onUnansweredEscalation` — `defer` (default) | `fix` — see Escalation policy
- `testGate` / `testCommand` — gated tests must pass before a task reports implemented (`testCommand` required when `testGate` is true)
- `repoRoot`, `store` — as above
- `worktree` — optional isolation; every created worktree path is reported for host integration/removal
- Returns `skipped_tasks` (deferred by unanswered escalation) and `next` for the host when applicable
- Requires the checkpoint-bridge extension for escalations

### openspec-campaign
- `items` — optional array of change names or `{change, intent}` records; omitted → discovery via `openspec list`
- `planMode` — `one` (default, proposals-only) or `scaffold`; deeper authoring per item is an explicit host re-invocation, never a campaign default
- `repoRoot`, `store` — as above; `digestFile` — digest name (default `CAMPAIGN.md`, repo root)
- Serial `openspec new change` (global-mutating, never parallelized); per-item outcomes `ok`/`needs_input`/`failed` with no blanket retries; digest never contains apply/archive/update instructions

### openspec-apply-campaign
- `changes` **(required)** — array of change names in dependency order (serial application; each `openspec-apply-change` run is idempotent — checkboxes are the state)
- `repoRoot` — absolute path to the repo holding the changes
- `onUnansweredEscalation` — `defer` | `fix` — forwarded to every per-change apply run
- Fail-soft per change: one blocked/failed change does not stop the campaign; the digest returns per-change `state`, `tasks_done/total`, `needs_input`, and host-only next steps. No commits, no archive.

## Invocation

```bash
# by name (inside a project with .pi/workflows populated by the skillshare extras)
#   just ask the model: run the pi-plugin-eval workflow with args {...}

# by path (anywhere, including headless)
pi -p --subagents-workflow-file="$HOME/pi-workflows/workflows/pi-plugin/pi-plugin-eval.js"   # use the = form
```

`args` may be passed as a JSON object or a JSON-encoded string (both handled).

## Maintenance discipline

- **Edit at source only** (`~/pi-workflows`), then `skillshare sync extras --force` — targets are managed
  **copies** (mode=copy) that go stale after source edits; plain sync SKIPS conflicting files in copy mode,
  so `--force` is the standard re-sync. `skillshare extras list` shows drift, `skillshare diff` covers extras.
  Never edit synced files inside a project.
- **Mode must be `copy`:** pi-subagents' workflow resolver SKIPS SYMLINKS when scanning
  `.pi/workflows/`, so `merge` (per-file symlink) and `symlink` (whole dir) modes break by-name
  discovery. Verified 2026-09-02: symlinked workflow -> "No saved workflow named ..."; real copy -> resolves.
- Workflow scripts must keep the `export const meta = { name, description }` declaration (the
  resolver's marker), a pure-literal `meta`, and no `Date.now`/`Math.random` (determinism for resume).
- **CI gate**: `node scripts/check-workflow-syntax.mjs` (prek + GitHub Actions) must pass before every push.
- Commits are GPG-signed; if the agent's passphrase cache expires mid-work, commit work is staged and the
  host re-runs the unlock ritual (`echo test | gpg --batch --clearsign /dev/null`).
- Add new projects as targets (both extras, same target): `skillshare extras pi-workflows-openspec --add-target /path/to/project/.pi/workflows -g && skillshare extras pi-workflows-plugins --add-target /path/to/project/.pi/workflows -g`
  then `skillshare sync extras -g --force`. Retire scratch projects with `--remove-target … --prune` on both extras.

## OpenSpec index

- **ADRs** (`docs/adr/`): ADR-0001 workflow family + checkpoint-bridge channel · ADR-0002 apply
  pipelines separate implementation from verification, hard stop on the first blocker ·
  ADR-0003 cross-provider model fallback + configurable unanswered-escalation policy.
- **Capability specs** (`openspec/specs/`): `apply-pipeline`, `campaign-orchestrator`,
  `pipeline-efficiency`, `plan-apply-ready-mode`.
- **Archived changes** (`openspec/changes/archive/`): `add-openspec-apply-pipeline`,
  `add-openspec-campaign-orchestrator`, `add-pipeline-efficiency`.
- **Active change**: `add-workflow-model-fallback` (implemented 2026-09-13; strict-valid).

## Validation history

- 2026-09-13: `add-workflow-model-fallback` implemented in all three OpenSpec workflow scripts
  (`agentFB` + cross-provider chains + `pi --list-models` discovery filtering; strict-valid;
  syntax gate green). Motivated by two OpenRouter shared-pool 429s in the apply-campaign runs.
- 2026-09-13: apply-campaign runs against 8 changes (84 tasks): first run 4.24M tokens / 51 agents /
  4 h, zero complete — root causes (unanswered bridge escalations aborting whole changes; load/status
  parse regressions) fixed with skip-and-continue + verbatim-JSON output contracts + configurable
  `onUnansweredEscalation`. A 2,292× `StructuredOutput` loop on `glm-5.3-flash` (degenerate
  blocked-snapshot payload) was diagnosed via `scripts/analyze-subagent-transcripts.mjs` and killed by
  the QA pattern (text verdicts + `parseAgentJson`) applied to ALL schema'd classes + the 3-strike cap.
- 2026-09-11..12: production run #2 (`add-cgc-slash-commands`) completed 11/11 across two attempts —
  first attempt 9.48M tokens (loop + full-suite test burns), continuation 402k tokens / 94 tool uses /
  12.6 min after the fixes. Final: 303/303 tests, `tsc` clean, strict-valid, commit `9193694`.
  Effort tiers (load medium, primer high) and the primer pointer-misfire guard date from this run.
- 2026-09-07: `add-pipeline-efficiency` implemented (model tiers, context primer, rolling handoffs, true-resume
  corrective passes, context discipline — nested decomposition DEFERRED with a measurable revisit trigger);
  the resumed `add-cgc-session-lifecycle-gate` run (12/16 → 16/16) completed the measurement: **16/16,
  `all_done`, zero incidents** (no loops, no runaway, no wrong-repo writes — all stability fixes held), quality
  gates clean (203/203 tests, typecheck pass). **Token target MISSED**: ~3.3M total (~825k/task vs the stopped
  run's ~400k/task baseline), 309 tool uses (≈20/agent) dominated by test-run and read outputs; the 20.7 h
  wall clock is machine sleep + provider latency, not compute. Verdict: the efficiency machinery is
  mechanically sound and flash tiers did not degrade quality, but the token target for implementation-heavy
  tasks was not met — diagnosis + tuning (test-output ingestion caps, tool-output budgets) required before
  the next production run.
- 2026-09-06: step 5 implemented + measured pilots PASSED: `apply-ready` loop on `add-pilot-note` (5 agents,
  ~246k tokens, ~116 s, planning_complete true — bounded; the first attempt ran away at 79 agents on an
  author-returned skip that never settles in status, fixed by skipSettled + maxIterations); `openspec-apply-change`
  on the same change (8 agents, ~406k→~297k tokens, all_done, 2/2 checkboxes marked by the SEPARATE verifier).
  Two live defects caught and fixed: a schema'd QA child looping forever on successful StructuredOutput calls
  (QA is now unschemad + gate-based), and task work landing in the wrong repository via relative paths
  (implementer/verifier prompts now pin the absolute repo root from the CLI's change_dir).
- 2026-09-07: `openspec-campaign` pilot PASSED — the last family member proven: 2 items via args, serial
  scaffolds, one-level plan fan-out (both proposals `ok`), mutation-rights discipline held across the fan-out
  (authors refused `.openspec.yaml` and flagged `skip_specs` for the host), `CAMPAIGN.md` digest composed with
  no apply/archive instructions. 7 agents, ~572k tokens, ~3.8 min. All four family members are now
  integration-proven; the first production run (`add-cgc-session-lifecycle-gate`, 16 tasks) was launched in
  `pi-codegraphcontext`.
- 2026-09-06: openspec family added (ADR-0001): `openspec-validate-change` dry-run on `add-cgc-agent-guide`
  apply-pipelines and a campaign orchestrator stay gated behind measured pilots.
- 2026-09-02: initial genericization from the 54-plugin context-optimization sweep
  (eval/verify/gate/skip-if-exists/tool-discipline hardened prompts; digest+compose synthesis).
- 2026-09-02: discovered pi-subagents resolver skips symlinked workflows in `.pi/workflows/` —
  switched the skillshare extra to copy mode; by-name invocation then resolved correctly.
  2-plugin smoke test via by-name + object args; args-as-string pass; drift check — see session log.