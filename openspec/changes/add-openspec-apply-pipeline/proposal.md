## Why

ADR-0001 (`docs/adr/ADR-0001-workflow-family-and-checkpoint-channel.md`) gates each new workflow-family member behind a measured pilot; the 2026-09-06 `openspec-plan-change` pilot passed, arming the next two members. Today the host session must re-invoke plan-change once per planning artifact and hand-drive `openspec instructions apply` task by task — both keep per-artifact loop logic, implementer coordination, and task-verification chatter in the main session, which the ADR-0001 campaign data identified as the dominant cost.

## What Changes

- `openspec-plan-change.js` gains an `apply-ready` mode (currently refused with an ADR-0001 pilot-gate error): after `scaffold`/`one` semantics, loop resolve→author→QA until every planning artifact is `done` or `skipped`, capped by a new `maxArtifacts` arg; a checkpoint-bridge `needs_input` pauses the loop and surfaces the question to the host instead of guessing.
- New `openspec-apply-change.js`: a per-task implementation pipeline over `openspec instructions apply --json` — implementer agents (optional git-worktree isolation, optional test gate), checkbox-verifier agents that mark a `tasks.md` checkbox only after verifying the implemented work, and a hard stop on the first paused or null agent result with structured escalation through the checkpoint-bridge `ask_user_via_host` tool (`needs_input` fallback when no host is armed).
- Host authority unchanged: the host session retains all approvals; `openspec archive` (including its inline delta-spec sync) and `openspec update` stay main-session-only — neither workflow ever runs them.
- README.md args contracts updated: `maxArtifacts` + `apply-ready` mode under `openspec-plan-change`, a new `openspec-apply-change` section.

## Capabilities

### New Capabilities

- `plan-apply-ready-mode`: the apply-ready authoring loop of `openspec-plan-change` — loop termination conditions (all planning artifacts done/skipped), the `maxArtifacts` cap, `needs_input` pause/resume semantics, and the guarantee that only CLI-resolved artifact files are written.
- `apply-pipeline`: the `openspec-apply-change` per-task implementation pipeline — task sequencing over `instructions apply --json`, implementer execution with optional worktree isolation and optional test gate, checkbox verification before any task is marked done, hard-stop-on-blocker escalation, and the archive/update prohibition.

### Modified Capabilities

- (none) — `openspec/specs/` contains no existing specs; the plan-change extension is introduced as the new `plan-apply-ready-mode` capability rather than a delta on an existing one.

## Impact

- **Code — `openspec-plan-change.js`** (informed the loop shape, agent-prompt constants, and structured return objects): gains the `apply-ready` mode and `maxArtifacts` arg; `one` and `scaffold` behavior unchanged (backward compatible).
- **Code — new `openspec-apply-change.js`** (house style taken from `openspec-validate-change.js` and `openspec-plan-change.js`: `export const meta` header, named phases, JSON schemas per agent, defensive args parse, StructuredOutput-style returns).
- **Checkpoint channel — `extensions/checkpoint-bridge/`** (per ADR-0001): used unchanged for structured escalation; workflows batch questions into one `ask_user_via_host` call.
- **Docs — `README.md`**: args-contract additions as listed above.
- **ADR — `docs/adr/`**: ADR-0001's pilot gate for these two members is satisfied by the 2026-09-06 plan-change pilot; the `apply-ready` refusal in plan-change is lifted by this change.
- **CI / tooling**: no dependency changes; the syntax gate remains `node scripts/check-workflow-syntax.mjs`; hygiene via prek at source (installed copies are sync outputs, never edit targets).
