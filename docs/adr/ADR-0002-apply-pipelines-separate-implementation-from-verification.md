# ADR-0002: Apply pipelines separate implementation from verification and stop hard on the first blocker

## Status

Accepted (2026-09-06). Extends ADR-0001 without superseding it.

## Context

ADR-0001's workflow family anticipated `openspec-apply-change` behind a measured pilot; the 2026-09-06 `openspec-plan-change` pilot passed, arming that member. The apply pipeline drives implementation task by task from `openspec instructions apply --json`, where task progress is derived from `tasks.md` checkboxes and the checkbox is the CLI's source of truth for "done".

Three structural facts constrain the pipeline's design:

1. An `agent()` call returns `null` for both failure and user skip, and a paused agent result is indistinguishable from silent non-work. A pipeline that treated these as success could report a change fully applied while tasks were never implemented.
2. The agent that implements a task has every incentive (and every ability) to mark its own checkbox; without structural separation, self-certification is the default behavior of a single-agent-per-task loop.
3. OpenSpec's `archive` (with its inline delta-spec sync) and `update` are approval-bearing, host-authority operations per ADR-0001; a workflow that ran them would move state the human never approved.

## Decision

1. **Two distinct agents per task: an implementer and a checkbox verifier.** The implementer edits the code for one task and MUST NOT touch `tasks.md` or run any `openspec` mutating verb; those prohibitions are enforced as verbatim prompt-contract lines carried into every agent prompt (the family's existing trust model — contractual, not sandboxed). The checkbox verifier alone reads the implemented work against the task description (and the gated test outcome, when the run enables a test gate), requires `evidence[]` entries in its structured result, and is the only agent that edits `tasks.md` to mark a checkbox. An implementer never marks its own box.
2. **A null or paused agent result is a blocker, never success.** On the first such result the pipeline stops dispatching immediately — no later task is started — and escalates with exactly one batched `ask_user_via_host` call through the checkpoint-bridge (ADR-0001's serial host dialog queueing makes batching mandatory). Host status `ok` resumes the pipeline with the answers applied; any other status returns a structured `needs_input` result naming the blocked task and the decision needed, with no retry and no guessing.
3. **Isolation and test gates are run-level optional arguments, default off.** `worktree: true` gives each implementer a task-scoped worktree whose paths the pipeline reports — the pipeline never merges into the main tree; the host integrates and removes. `testGate: true` (optionally with `testCommand`) makes a non-passing outcome un-implementable, routing through the blocker path above.
4. **The archive/update prohibition is inherited verbatim from ADR-0001, not restated as new architecture.** Neither the pipeline nor its agents run `openspec archive` or `openspec update`; the host session retains all approvals.

## Consequences

- **Easier:** self-certification is structurally impossible inside the pipeline — progress in `tasks.md` always reflects an independent verification; the null-result ambiguity is resolved in the safe direction (a deliberately skipped task can be re-marked by the host, but a silently unimplemented task could not be recovered); the host's pre-archive review remains the final gate without additional machinery.
- **Harder:** every task costs two agent dispatches instead of one (token and wall-clock cost); a verifier could rubber-stamp, mitigated only by the mandatory `evidence[]` requirement and prompt language requiring it to read the implemented files rather than trust the implementer's report; the hard stop sacrifices any parallelism across tasks once a blocker appears.
- **Follow-ups:** the future `openspec-campaign` orchestrator (ADR-0001's fourth member) composes over these semantics rather than redefining them; if measured pilots show per-task host integration of worktrees is too costly, that trade-off gets its own ADR.

## Alternatives considered

- **One agent implements and marks its own checkbox:** rejected outright — it makes progress reporting self-certified, which the `apply-pipeline` spec forbids.
- **Treat null agent results as deliberate skips:** rejected — the safe direction is to treat them as blockers; a false skip is unrecoverable, while a false blocker costs one host round-trip.
- **Persistent journal replay for pause/resume:** rejected — ADR-0001 keeps resumption through the host re-invoking the workflow; the CLI status graph and `tasks.md` checkboxes are the only durable state, so pause/resume stays stateless.
- **Sandbox enforcement of the archive/update prohibition:** rejected — the family's established trust model is prompt-contract enforcement with host-side review; no workflow code path invokes the forbidden verbs, and adding a sandbox would be a new extension surface without a demonstrated bypass.
