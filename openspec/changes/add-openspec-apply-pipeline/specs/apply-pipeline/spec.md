## ADDED Requirements

### Requirement: Tasks are implemented in CLI-declared sequence

Feature: apply-pipeline
Rule: `openspec-apply-change` SHALL drive implementation task by task from `openspec instructions apply --json`, and MUST NOT invent task order, ids, or paths outside what the CLI resolves.

#### Scenario: Pipeline walks the task list in order

- **GIVEN** a change whose `tasks.md` is approved and whose apply instructions enumerate tasks in sequence
- **WHEN** `openspec-apply-change` runs
- **THEN** it takes the next incomplete task from the CLI output and dispatches an implementer agent for it
- **AND** it repeats until no incomplete task remains

#### Scenario: Task list is exhausted

- **GIVEN** every task reported by the apply instructions is complete and verified
- **WHEN** `openspec-apply-change` runs
- **THEN** it performs no implementation work
- **AND** it returns a structured result stating the change is fully applied

### Requirement: Implementer agents work in optional isolation with an optional test gate

Feature: apply-pipeline
Rule: Each task SHALL be executed by an implementer agent that works without git-worktree isolation by default, creating and using a worktree only when the run's arguments request it; when a test gate is requested, the implementer MUST leave the affected code in a state where the gated tests pass before reporting success.

#### Scenario: Default run without requested isolation

- **GIVEN** a run of `openspec-apply-change` whose arguments do not request worktree isolation
- **WHEN** an implementer agent executes a task
- **THEN** the agent edits the repository working tree directly
- **AND** no worktree is created for that task

#### Scenario: Isolation is requested for the run

- **GIVEN** a run whose arguments request worktree isolation
- **WHEN** an implementer agent executes a task
- **THEN** the agent works inside a worktree created for the task
- **AND** the main working tree is untouched by the task's edits until the work is integrated

#### Scenario: Test gate is requested and passes

- **GIVEN** a run whose arguments enable the test gate
- **WHEN** an implementer agent finishes a task
- **THEN** the agent reports the gated test outcome with the task result
- **AND** a passing outcome is the only result a checkbox verifier will accept as implemented

### Requirement: Checkbox verification is a separate agent from the implementer

Feature: apply-pipeline
Rule: A `tasks.md` checkbox SHALL be marked complete only by a checkbox-verifier agent that is distinct from the implementer agent and that verifies the implemented work against the task description; an implementer MUST NOT mark its own checkbox.

#### Scenario: Verified work gets its checkbox marked

- **GIVEN** an implementer agent has reported success for a task
- **WHEN** the checkbox-verifier agent inspects the implemented work against that task's description
- **AND** the verification confirms the work matches the task
- **THEN** the checkbox verifier marks the task's checkbox in `tasks.md`
- **AND** the pipeline proceeds to the next task

#### Scenario: Verification fails on unverified work

- **GIVEN** an implementer agent has reported success for a task
- **AND** the checkbox verifier finds the work does not match the task description or the gated tests fail
- **WHEN** the checkbox verifier evaluates the task
- **THEN** it does not mark the checkbox
- **AND** the pipeline treats the task as blocked and escalates

### Requirement: The pipeline stops hard on the first blocker and escalates once

Feature: apply-pipeline
Rule: On the first paused or null agent result, `openspec-apply-change` SHALL stop the pipeline immediately and MUST batch the escalation into one `ask_user_via_host` call through the checkpoint-bridge. If the host answers, it MUST resume; for any non-success host status it MUST return a structured `needs_input` result without guessing and without retrying.

#### Scenario: Blocker escalates to an armed host

- **GIVEN** the pipeline is running and an implementer or checkbox verifier returns a paused or null result
- **AND** a host session with the checkpoint-bridge is available
- **WHEN** the pipeline handles the blocker
- **THEN** it stops immediately and does not dispatch work for later tasks
- **AND** it calls `ask_user_via_host` once with all questions batched
- **AND** on a successful host answer it resumes the pipeline with the host's decisions applied

#### Scenario: Blocker with no host armed

- **GIVEN** the pipeline encounters a paused or null agent result
- **AND** no host session is available so `ask_user_via_host` reports a non-success status
- **WHEN** the pipeline handles the blocker
- **THEN** it does not guess and does not call the host again
- **AND** it returns a structured `needs_input` result naming the blocked task and what the host must decide
- **AND** no checkbox is marked for the blocked task

### Requirement: Archive and update stay out of the pipeline

Feature: apply-pipeline
Rule: `openspec-apply-change` SHALL NOT run `openspec archive` (including its inline delta-spec sync) or `openspec update`; both commands MUST remain main-session-only, and the host session retains all approvals.

#### Scenario: Pipeline completes without archiving

- **GIVEN** the pipeline has implemented and verified the last task of a change
- **WHEN** the pipeline finishes
- **THEN** it returns a structured completion result to the caller
- **AND** it has not run `openspec archive` or `openspec update`
- **AND** archiving and spec syncing remain available only in the main host session
