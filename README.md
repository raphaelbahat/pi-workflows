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
| `workflows/openspec/openspec-apply-change.js` | Per-task implementation pipeline: Load (`instructions apply --json`, fail-fast on blocked) → per task an implementer agent + a SEPARATE checkbox-verifier agent → ONE batched bridge escalation on the first blocker → Report. `worktree`/`testGate` optional, default off. Never archives/updates |
| `workflows/openspec/openspec-campaign.js` | Campaign orchestrator for N independent changes: serial `openspec new change` scaffolding (global-mutating, never parallelized), one-level `workflow('openspec-plan-change')` fan-out (proposals-only default), per-item outcome tracking, `CAMPAIGN.md` digest. Never applies/archives/updates |
| `extensions/checkpoint-bridge/` | pi extension (not a workflow): relays sub-agent `ask_user_via_host` calls over a process-global bus to the main session's UI — the ADR-0001 checkpoint channel (pi.events proved session-scoped; see the ADR amendment). Published to npm as `pi-checkpoint-bridge`; **required for all `workflows/openspec/` authoring/apply workflows** |

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
- Read-only: reviewers never edit artifacts; findings return to the host session

### openspec-plan-change
- `change` **(required)** — kebab-case change name
- `mode` — `one` (default: author exactly the first `ready` artifact), `scaffold` (create + report first instructions, no write), or `apply-ready` (loop resolve→author→QA until every planning artifact is `done`/`skipped`)
- `maxArtifacts` — apply-ready cap per run (default 12); the return names remaining artifacts so a later run resumes idempotently
- `create` — set truthy to let the resolve stage run `openspec new change` (host pre-approves by passing it)
- `intent` — optional host-authored brief for the author agent
- `repoRoot`, `store` — repo root for the CLI; store id appended as `--store`
- Requires the checkpoint-bridge extension: if `ask_user_via_host` is absent, the run returns a friendly `checkpoint-bridge-not-installed` error instead of authoring (install: `pi install npm:pi-checkpoint-bridge`)

### openspec-apply-change
- `change` **(required)** — kebab-case name of a planning-complete change
- `worktree` — run-level worktree isolation per implementer (default **off**); created worktree paths are returned — the host integrates and removes
- `testGate` / `testCommand` — gated tests must pass before a task reports implemented (`testCommand` required when `testGate` is true)
- `repoRoot`, `store` — as above
- Implementer agents never touch `tasks.md`; a separate checkbox-verifier agent marks checkboxes with `evidence[]`; hard stop + ONE batched bridge escalation on the first blocker; `needs_input` when no host answers

### openspec-campaign
- `items` — optional array of change names or `{change, intent}` records; omitted → discovery via `openspec list`
- `planMode` — `one` (default, proposals-only) or `scaffold`; deeper authoring per item is an explicit host re-invocation, never a campaign default
- `repoRoot`, `store` — as above; `digestFile` — digest name (default `CAMPAIGN.md`, repo root)
- Serial `openspec new change` (global-mutating, never parallelized); per-item outcomes `ok`/`needs_input`/`failed` with no blanket retries; digest never contains apply/archive/update instructions

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
- Add new projects as targets (both extras, same target): `skillshare extras pi-workflows-openspec --add-target /path/to/project/.pi/workflows -g && skillshare extras pi-workflows-plugins --add-target /path/to/project/.pi/workflows -g`
  then `skillshare sync extras -g --force`. Retire scratch projects with `--remove-target … --prune` on both extras.

## Validation history

- 2026-09-06: step 5 implemented + measured pilots PASSED: `apply-ready` loop on `add-pilot-note` (5 agents,
  ~246k tokens, ~116 s, planning_complete true — bounded; the first attempt ran away at 79 agents on an
  author-returned skip that never settles in status, fixed by skipSettled + maxIterations); `openspec-apply-change`
  on the same change (8 agents, ~406k→~297k tokens, all_done, 2/2 checkboxes marked by the SEPARATE verifier).
  Two live defects caught and fixed: a schema'd QA child looping forever on successful StructuredOutput calls
  (QA is now unschemad + gate-based), and task work landing in the wrong repository via relative paths
  (implementer/verifier prompts now pin the absolute repo root from the CLI's change_dir).
- 2026-09-06: openspec family added (ADR-0001): `openspec-validate-change` dry-run on `add-cgc-agent-guide`
  apply-pipelines and a campaign orchestrator stay gated behind measured pilots.
- 2026-09-02: initial genericization from the 54-plugin context-optimization sweep
  (eval/verify/gate/skip-if-exists/tool-discipline hardened prompts; digest+compose synthesis).
- 2026-09-02: discovered pi-subagents resolver skips symlinked workflows in `.pi/workflows/` —
  switched the skillshare extra to copy mode; by-name invocation then resolved correctly.
  2-plugin smoke test via by-name + object args; args-as-string pass; drift check — see session log.
