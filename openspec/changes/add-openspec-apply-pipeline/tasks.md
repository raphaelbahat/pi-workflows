# Tasks: add-openspec-apply-pipeline

Dependency sources (one line each): `specs/plan-apply-ready-mode/spec.md` fixed loop termination, the `maxArtifacts` cap, checkpoint pause/resume, and CLI-resolved-only writes; `specs/apply-pipeline/spec.md` fixed task sequencing, optional isolation/test gate, implementer/verifier separation, hard-stop escalation, and the archive/update prohibition; `design.md` (D1–D8) supplied the named phases, prompt-contract enforcement, and arg defaults; `adr.md` handed off ADR-0002 and ADR-0001's measured-pilot gate; `proposal.md` fixed the two members and the README/docs impact surface.

## 1. Apply-ready mode in openspec-plan-change.js

- [ ] 1.1 Extend `openspec-plan-change.js` args validation to accept `mode: "apply-ready"` and a new `maxArtifacts` argument (default 12 per design D2), lifting the current ADR-0001 pilot-gate refusal error; `one` and `scaffold` behavior remain byte-for-byte unchanged (backward compatible).
- [ ] 1.2 Implement the resolve→author→QA loop: each iteration re-runs `openspec status --change <name> --json`, resolves the next artifact that is not `done` or `skipped` from the CLI (never hardcoded ids/paths), re-uses the existing per-artifact agent trio and prompt constants, and writes only at the instruction's `resolvedOutputPath` — artifacts whose instruction reports skipped produce no file.
- [ ] 1.3 Implement the `maxArtifacts` cap: count artifacts authored this run, stop after the cap, and return a structured result naming the `remaining` unfinished artifacts so a later run resumes without re-authoring settled ones.
- [ ] 1.4 Implement checkpoint pause/resume: on a material ambiguity while authoring, batch all questions into one `ask_user_via_host` call; on host status `ok` resume authoring with the answers, and on any non-success status return a structured `needs_input` result with no retry, no guessing, and no artifact file written from a guessed answer.
- [ ] 1.5 Verify (checkbox verifier agent, distinct from the implementer): confirm group 1 against `specs/plan-apply-ready-mode/spec.md` scenarios — loop settles only on done/skipped, skipped artifacts produce no file, cap bounds one run and resumes idempotently, ambiguity pauses via one batched ask, and every written file sits at its CLI-resolved path. Mark checkboxes only with `evidence[]` entries.

## 2. openspec-apply-change.js pipeline

- [ ] 2.1 Create `openspec-apply-change.js` styled on `openspec-validate-change.js` (ESM `export const meta` header, named phases Load / Implement / Escalate / Report per design D4, defensive args parse, JSON schemas per agent): the Load phase runs `openspec instructions apply --change <name> --json` once and fails fast with `missingArtifacts` when `state` is `blocked`.
- [ ] 2.2 Implement the Implement phase: each iteration re-queries `openspec instructions apply --json`, takes the next incomplete task from the CLI output (never inventing task order, ids, or paths), and dispatches an implementer agent whose prompt forbids touching `tasks.md` and any `openspec` mutating verb; when no incomplete task remains, return a structured result stating the change is fully applied.
- [ ] 2.3 Implement run-level optional args per design D6: `worktree` (default off — when requested, each implementer creates and works in a task-scoped worktree and the workflow reports created worktree paths for host integration; the pipeline never merges into the main tree) and `testGate` with an explicit `testCommand` (explicit-only in v1, default off — the implementer must run the gated tests and report the outcome; a non-passing outcome is un-implementable and routes to escalation).
- [ ] 2.4 Implement the checkbox-verifier agent dispatch per design D5: a distinct agent receives the task description plus the implemented work (and the gated test outcome when the gate is on), returns `{task_id, verified, evidence[], marked}`, and only it edits `tasks.md` to mark a checkbox — an implementer never marks its own; a failed verification treats the task as blocked and escalates.
- [ ] 2.5 Implement the Escalate phase per design D7: on the first paused or null agent result (or failed gate), stop the pipeline immediately — no dispatch for later tasks — and batch the escalation into one `ask_user_via_host` call; on host status `ok` resume with the answers applied, and on any non-success status return a structured `needs_input` result naming the blocked task and the decision needed, with no retry, no guessing, and no checkbox marked for the blocked task.
- [ ] 2.6 Implement the Report phase returning `{change, tasks_done, tasks_remaining, blocked_task, needs_input, worktrees[], next}`; the pipeline contains no code path invoking `openspec archive` (including its inline delta-spec sync) or `openspec update`, and its `CONTRACT` prompt block lists both forbidden verbs verbatim per design D8.
- [ ] 2.7 Verify (checkbox verifier agent, distinct from the implementer): confirm group 2 against `specs/apply-pipeline/spec.md` scenarios — in-order task walk, exhausted-task no-op, default no-isolation run, requested isolation, requested passing gate, verifier-only checkbox marking, blocker hard stop with one batched ask (armed and unarmed host), and no archive/update invocation. Mark checkboxes only with `evidence[]` entries.

## 3. README args contracts

- [ ] 3.1 Update `README.md`: document the `apply-ready` mode and `maxArtifacts` argument under the `openspec-plan-change` args contract (defaults, pause/resume semantics, and that `one`/`scaffold` are unchanged).
- [ ] 3.2 Update `README.md`: add an `openspec-apply-change` args section — `change` (required), `worktree`, `testGate`, `testCommand`, `repoRoot`, `store` — including the host-authority note that archive/update and all approvals remain main-session-only.
- [ ] 3.3 Verify (checkbox verifier agent): confirm the README contracts match the actual arg parsing and structured returns of both scripts (no documented-but-absent or implemented-but-undocumented args).

## 4. Gates and validation

- [ ] 4.1 Run `node scripts/check-workflow-syntax.mjs` and fix any failures in the touched scripts (the syntax gate is the CI bar; a bare `node --check` fails by design on top-level return).
- [ ] 4.2 Smoke-test both surfaces: `one` and `scaffold` modes of `openspec-plan-change` produce identical behavior to before; `apply-ready` and `openspec-apply-change` run end-to-end against a dry/scratch change, exercising skip handling, the cap, and a needs_input path without touching real state.
- [ ] 4.3 Run `openspec validate add-openspec-apply-pipeline --type change --strict` and resolve any reported issues before the change is eligible for archive.
- [ ] 4.4 Verify (checkbox verifier agent): confirm the syntax gate passes, smoke-test outcomes are recorded (including any deviation from expected behavior), and the strict validation output is clean.

## 5. Measured pilot per ADR-0001

- [ ] 5.1 Run the first measured pilot of both members on one real change driven end-to-end through apply-ready plus the apply pipeline (per ADR-0001's gate, armed by the 2026-09-06 plan-change pilot): record agent counts, token spend, and wall-clock time, and enter the measurements into README's Validation history per the migration plan.
- [ ] 5.2 Verify (checkbox verifier agent): confirm the pilot metrics are recorded in README's Validation history and that the ADR-0001 pilot gate for both members is satisfied, with any worktree-integration cost observation noted for a possible future ADR.
