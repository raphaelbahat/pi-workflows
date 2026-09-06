# Task Validation: add-openspec-campaign-orchestrator

- Validated against: live framework/library/tool documentation
- Validation date: 2026-09-06
- Method note: sub-agent dispatch was not used; validation was carried out in the main agent per the instruction's documented fallback, with the same evidence discipline (Context7/MCP tools were unavailable in this session; evidence below cites the installed OpenSpec CLI v1.12.0 `--help` output — the exact binary the tasks will invoke, official upstream sources fetched live, and the repository's own authoritative sources for house conventions).
- Verdict: READY

---

## INVALID — requires revision

None. All tasks in `tasks.md` are valid against live documentation and the authoritative local sources they depend on.

---

## VALID — confirmed

### 1.1, 1.2

- House-style claims are accurate for the repo root: `openspec-plan-change.js` has `export const meta` (line 1), named phases, `TOOL`/`CONTRACT`/`GRILL` constants (lines 12/18/139), defensive JSON args parse (`const A = (typeof args === 'string') ? JSON.parse(args) : (args || {})`, line 77), and `repoRoot`/`store` forwarded into shell prefixes exactly as task 1.2 describes (lines 80–81: `ROOT = A.repoRoot ? 'cd ' + A.repoRoot + ' && ' : ''`, `STORE = A.store ? ' --store ' + A.store : ''`). `openspec-validate-change.js` confirms the fan-out/dimension pattern. Informed by: `design.md` Context/Decision 8, `specs/campaign-orchestrator/spec.md`.
  - **Evidence**: `/home/bahat/pi-workflows/openspec-plan-change.js` (source of truth for house style); `scripts/check-workflow-syntax.mjs` lines 7–10 (engine-shaped async body, top-level `return`/`await` legal, `export const meta` loader metadata)

### 1.3, 1.4, 1.5

- Every OpenSpec CLI verb the tasks use exists in the installed CLI the scripts will actually call (v1.12.0): `openspec list` (`--json`, `--store`, lists changes), `openspec new change <name>` (`--description`, `--goal`, `--schema`, `--json`, `--store`), and `openspec status`/`instructions` JSON contract. The serial-scaffold / parallel-plan split and the `planMode: 'one'` default match the spec scenarios and the CLI's per-change output scoping.
  - **Evidence**: `openspec list --help`, `openspec new change --help`, `openspec validate --help` (installed `@fission-ai/openspec` v1.12.0 at `~/.bun/bin/openspec`); upstream: https://github.com/Fission-AI/OpenSpec and https://openspec.dev/
- The `workflow('openspec-plan-change')` invocation shape in task 1.5 is the established in-repo composition pattern, not a guess: `pi-plugin-pipeline.js` composes its sibling workflows with exactly `await workflow('pi-plugin-eval', { ... })` and consumes structured returns, including null-guarding. ADR-0001 records the family's "composed one level deep" rule.
  - **Evidence**: `/home/bahat/pi-workflows/pi-plugin-pipeline.js`; `docs/adr/ADR-0001-workflow-family-and-checkpoint-channel.md` line 18

### 1.6, 1.7

- The checkpoint-bridge contract matches: `ask_user_via_host` "never throws for environmental reasons. It returns a structured" result, and plan-change's `GRILL` constant already encodes the exact status vocabulary (`ok` / `no-host` / `timeout` / `timeout-or-cancelled` / `cancelled` / `error`) and the batched-once rule that tasks 1.6–1.7 inherit.
  - **Evidence**: `extensions/checkpoint-bridge/README.md` (lines 19, 31); `openspec-plan-change.js` lines 139–143

### 1.8, 1.9

- The prohibition prompt-contract lines (never `openspec apply` / `openspec archive` / `openspec update`; never move or sync state) mirror plan-change's existing `CONTRACT`/`TOOL` constants verbatim — the campaign inherits rather than invents them. The return-only-digest-path containment matches the family's structured-return shape (`action: wrote|skipped|needs_input`, no shard bodies).
  - **Evidence**: `openspec-plan-change.js` lines 12–18 (`TOOL`, `CONTRACT`) and 58 (structured return schema); `docs/adr/ADR-0001` / `docs/adr/ADR-0002` trust model

### 2.1, 2.2

- README structure supports both tasks: the "Args contracts" section (per-workflow subsections, e.g. `### pi-plugin-eval`) and the workflow table (rows for `openspec-validate-change.js`, `openspec-plan-change.js`, `extensions/checkpoint-bridge/`) exist exactly where the new `openspec-campaign` section and table row go.
  - **Evidence**: `/home/bahat/pi-workflows/README.md` (workflow table + "## Args contracts")

### 3.1, 3.2

- The syntax gate exists and reproduces the engine wrapper (`new vm.Script("(async () => {\n" + script + "\n})()" ...)` per `scripted-workflow.ts`); top-level `await`/`return` legal, bare `node --check` fails by design — task 3.1's framing is correct. `prek` is the hygiene gate (installed v0.5.2; CI runs `prek run -a`).
  - **Evidence**: `scripts/check-workflow-syntax.mjs`; `.github/workflows/ci.yml` lines 34–41; `CONTRIBUTING.md` lines 14–19; https://github.com/j178/prek (official README: `prek run --all-files` form)

### 4.1, 4.2, 5.1

- Process tasks are valid: the strict gate command in 5.1 was executed live during this validation — `openspec validate add-openspec-campaign-orchestrator --type change --strict` returns "Change 'add-openspec-campaign-orchestrator' is valid" — confirming both the command form and the change's current strict validity. The 2–3-item pilot and measured-baseline steps match ADR-0001's measured-pilot gating and design.md Migration Plan steps 4–5.
  - **Evidence**: live run of `openspec validate add-openspec-campaign-orchestrator --type change --strict` (2026-09-06); `docs/adr/ADR-0001-workflow-family-and-checkpoint-channel.md`; `design.md` Migration Plan

---

## Fixes needed

None. No task cites an invalid API, flag, command form, or repo convention; no cross-cutting correction is required in tasks, specs, design, or the adr manifest.

Residual warning (advisory, pre-existing repo drift — not a task defect and does not block apply): `CONTRIBUTING.md` still describes the repo as holding only the four `pi-plugin-*.js` scripts and labels `node scripts/check-workflow-syntax.mjs pi-plugin-*.js` as "what CI runs", while the repo also contains `openspec-*.js` scripts and CI actually runs `prek run -a` (`.github/workflows/ci.yml`). Task 3.1 remains valid because it correctly instructs running the gate script on the new file; but the glob in CONTRIBUTING should be widened to include `openspec-*.js` in a future docs-only change so CI gate coverage is unambiguous.

---

## Verdict

`VERDICT: READY`
