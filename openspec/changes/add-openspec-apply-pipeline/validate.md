# Task Validation: add-openspec-apply-pipeline

- Validated against: live framework/library/tool documentation — for these internal technologies the authoritative live sources are the `openspec` CLI itself (run live against this change), the repo's workflow-engine sources, and the in-repo extension/ADR documentation
- Validation date: 2026-09-06
- Verdict: READY

Method note: per-task validators could not be dispatched as sub-agents in this session; the fallback documented in the validate instruction was applied — grouping and per-group validation were carried out directly in the main agent with the same evidence discipline (live CLI output and repository sources; no file was written other than this artifact).

Technology groups validated:

1. **openspec CLI** (`status --json`, `instructions apply --json`, `validate --strict`) — tasks 1.1–1.3, 2.1–2.2, 4.3
2. **checkpoint-bridge extension** (`ask_user_via_host`) — tasks 1.4, 2.5
3. **pi-subagents workflow engine / house style** (`export const meta`, named phases, prompt constants, syntax gate) — tasks 1.1–1.2, 2.1, 2.4, 2.6, 4.1
4. **Worktree isolation / test gate surfaces** — task 2.3
5. **README args-contract surface & Validation history** — tasks 3.1–3.3, 5.1
6. **ADR-0001 measured-pilot gate** — tasks 5.1–5.2

---

## INVALID — requires revision

None.

---

## VALID — confirmed

### 1.1

- The current `openspec-plan-change.js` args validation refuses `apply-ready` with an ADR-0001 pilot-gate error (`args.mode must be 'one' or 'scaffold' — 'apply-ready' authoring is gated behind a measured pilot (ADR-0001)…`, line 87), so "lifting the current ADR-0001 pilot-gate refusal error" describes a real code point; extending mode validation + adding `maxArtifacts` (default 12 per design D2) is implementable as stated.
  - **Evidence**: `openspec-plan-change.js:87` (live repo source, /home/bahat/pi-workflows)

### 1.2 / 1.3

- The resolve→author→QA loop and `maxArtifacts` cap match live CLI behavior: `openspec status --change <name> --json` exposes per-artifact `status` (`done`/`ready`/`blocked`/…) plus `resolvedOutputPath` / `existingOutputPaths` per artifact (verified against this very change), and `openspec instructions <artifact> --json` reports skipped artifacts (this change's validate instruction ran with `existingOutputPaths: []`, confirming a not-yet-authored artifact is resolvable without hardcoding). Nothing in the CLI contradicts loop-termination-only-on-done/skipped or CLI-resolved-only writes.
  - **Evidence**: `openspec status --change add-openspec-apply-pipeline --json` and `openspec instructions validate --change add-openspec-apply-pipeline --json` (live runs, 2026-09-06)

### 1.4 / 2.5

- `ask_user_via_host` exists in the checkpoint-bridge extension exactly as the tasks assume: it accepts a batch of questions in one call, never throws for environmental reasons, and returns a structured status — so "batch all questions into one call", "status `ok` resumes", and "any non-success status → structured `needs_input`, no retry" map 1:1 onto documented behavior.
  - **Evidence**: `extensions/checkpoint-bridge/README.md` (batching, structured non-throwing return, exposure rules)

### 2.1 / 2.2

- The live `openspec instructions apply --change add-openspec-apply-pipeline --json` payload carries every field the tasks rely on: `changeName`, `changeDir`, `contextFiles`, `progress {total, complete, remaining}`, `tasks[]` (id/description/done), `state` (`blocked`|`ready`), `missingArtifacts[]`, and `instruction`. The fail-fast claim in 2.1 ("fails fast with `missingArtifacts` when `state` is `blocked`") was directly observed: the change is currently `blocked` with `missingArtifacts: ["validate"]` — the pipeline design matches the actual CLI contract.
  - **Evidence**: `openspec instructions apply --change add-openspec-apply-pipeline --json` (live run, 2026-09-06)

### 2.3 / 2.4

- Run-level `worktree`/`testGate` args and the implementer/verifier split are implementable with existing engine surfaces: pi provides native worktree tools (`create_worktree`/`remove_worktree`/`list_worktrees`) so task-scoped worktree creation needs no new tooling, and the house JSON-schema-per-agent pattern (seen in both `openspec-plan-change.js` and `openspec-validate-change.js`) accommodates the `{task_id, verified, evidence[], marked}` verifier schema.
  - **Evidence**: `openspec-plan-change.js` / `openspec-validate-change.js` agent schemas; pi native worktree tool family

### 2.6

- House style already carries the archive/update prohibition verbatim in the `CONTRACT` prompt block (`openspec-plan-change.js:18-19` — "Never run: openspec archive, openspec update…"), so extending that block to the apply pipeline per design D8 is consistent with the existing enforcement model; there is no engine behavior contradicting prompt-contract enforcement.
  - **Evidence**: `openspec-plan-change.js:18-19`

### 3.1 / 3.2 / 3.3

- README is the documented args-contract surface: an `### openspec-plan-change` args section exists (README.md:51) plus a script table row (README.md:16) to extend with `apply-ready`/`maxArtifacts`, and there is no `openspec-apply-change` section yet — so 3.1–3.3 describe real, applicable edits.
  - **Evidence**: `README.md:16,51`

### 4.1

- `scripts/check-workflow-syntax.mjs` exists and its header documents exactly the task's claim: workflow bodies are compiled inside an IIFE with metadata stripped, so a bare `node --check` always fails by design while the script's wrapper-compilation is the CI bar.
  - **Evidence**: `scripts/check-workflow-syntax.mjs:9,16`

### 4.2 / 4.3

- Smoke-test and strict-validation steps are executable as written. `openspec validate add-openspec-apply-pipeline --type change --strict` was run during this validation and reports: "Change 'add-openspec-apply-pipeline' is valid" (exit 0).
  - **Evidence**: live CLI run, 2026-09-06

### 5.1 / 5.2

- The measured-pilot gate is real and armed: ADR-0001 exists at `docs/adr/ADR-0001-workflow-family-and-checkpoint-channel.md`, and README's Validation history (README.md:85) already records the 2026-09-06 `openspec-plan-change` pilot (6 agents, ~527k tokens, ~12 min), satisfying the precondition the tasks assume for the two new members.
  - **Evidence**: `docs/adr/ADR-0001-workflow-family-and-checkpoint-channel.md`; `README.md:85-90`

---

## Fixes needed

- None. No cross-cutting corrections are required; all task claims traced to live CLI behavior, repository sources, extension documentation, or the in-force ADRs (ADR-0001; ADR-0002 as recorded in the change's `adr.md` manifest, confirmed present at `docs/adr/ADR-0002-apply-pipelines-separate-implementation-from-verification.md`).

---

## Verdict

`VERDICT: READY`
