# pi-workflows

Reusable, args-driven [pi-subagents](https://github.com/tintinweb/pi-subagents) workflows.
Distributed to projects via the Skillshare global extra `pi-workflows`
(source = this repo, mode = **copy** — real files at `<project>/.pi/workflows/`).

## Files

| Workflow | Purpose |
|---|---|
| `pi-plugin-eval.js` | One high-effort research agent per plugin reads ALL provided URLs and writes a structured report; per-report QA verifier; `gate` on report existence; skip-if-report-exists (idempotent re-runs) |
| `pi-plugin-comparison.js` | Context-safe two-stage synthesis: parallel digest agents (shards) extract totals/strengths/weaknesses/families, one composer writes the ranked comparison |
| `pi-plugin-stack-advisor.js` | 4 persona-lensed advisors + 1 unbiased propose complementary, non-conflicting plugin stacks; synthesizer merges them |
| `pi-plugin-pipeline.js` | Orchestrator: eval → comparison → (optional, `args.stack`) stack recommendations |
| `openspec-validate-change.js` | Read-only validation sweep for one OpenSpec change: 4 parallel reviewer dimensions (completeness/correctness/coherence/unbiased) + strict CLI gate → CRITICAL/WARNING/SUGGESTION scorecard report |
| `openspec-plan-change.js` | Schema-driven authoring for one change: resolve graph via CLI, author the first ready artifact from its template, QA. Modes: `scaffold`\|`one`. Grill via the grill-bridge `ask_user` tool; `needs_input` fallback. Never applies/archives |
| `extensions/grill-bridge/` | pi extension (not a workflow): relays sub-agent `ask_user` calls over the in-process `pi.events` bus to the main session's UI — the ADR-0001 checkpoint channel |

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
- `reportFile` — scorecard output path (default `.scratch/openspec-validate-report-<change>.md`)
- Read-only: reviewers never edit artifacts; findings return to the host session

### openspec-plan-change
- `change` **(required)** — kebab-case change name
- `mode` — `one` (default: author exactly the first `ready` artifact) or `scaffold` (create + report first instructions, no write); `apply-ready` is refused pending its measured pilot (ADR-0001)
- `create` — set truthy to let the resolve stage run `openspec new change` (host pre-approves by passing it)
- `intent` — optional host-authored brief for the author agent
- `repoRoot`, `store` — repo root for the CLI; store id appended as `--store`
- Writes ONLY the one assigned artifact; ambiguities go through grill-bridge `ask_user` (armed automatically in sessions that load the extension), otherwise return `needs_input`

## Invocation

```bash
# by name (inside a project with .pi/workflows populated by the skillshare extra)
#   just ask the model: run the pi-plugin-eval workflow with args {...}

# by path (anywhere, including headless)
pi -p --subagents-workflow-file="$HOME/pi-workflows/pi-plugin-eval.js"   # use the = form
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
- Add new projects as targets: `skillshare extras pi-workflows --add-target /path/to/project/.pi/workflows -g`
  then `skillshare sync extras`. Retire scratch projects with `--remove-target … --prune`.

## Validation history

- 2026-09-06: openspec family added (ADR-0001): `openspec-validate-change` dry-run on `add-cgc-agent-guide`
  matched the manual baseline — strict gate PASS, 0 CRITICAL false-positives, 60 claims checked, and it caught
  a real staleness issue (in-force-ADR manifest predating ADR-0008/0009) that write-time validation could not;
  6 agents, ~527k tokens, ~12 min. `openspec-plan-change` shipped in `one`/`scaffold` modes; `apply-ready`,
  apply-pipelines and a campaign orchestrator stay gated behind measured pilots.
- 2026-09-02: initial genericization from the 54-plugin context-optimization sweep
  (eval/verify/gate/skip-if-exists/tool-discipline hardened prompts; digest+compose synthesis).
- 2026-09-02: discovered pi-subagents resolver skips symlinked workflows in `.pi/workflows/` —
  switched the skillshare extra to copy mode; by-name invocation then resolved correctly.
  2-plugin smoke test via by-name + object args; args-as-string pass; drift check — see session log.
