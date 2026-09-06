## ADDED Requirements

### Requirement: Apply-ready authoring loop terminates only on completion

Feature: plan-apply-ready-mode
Rule: The apply-ready mode of `openspec-plan-change` SHALL loop resolve→author→QA until every planning artifact of the change reports `done` or `skipped`, and MUST NOT exit the loop while any artifact remains actionable.

#### Scenario: Loop completes when all artifacts are settled

- **GIVEN** a change whose planning artifacts are `proposal`, `specs`, `design`, `adr`, `tasks`, and `validate`
- **AND** every artifact is not yet `done` or `skipped`
- **WHEN** the apply-ready mode runs with a `maxArtifacts` cap large enough to cover the remaining artifacts
- **THEN** it resolves the next artifact from the CLI, authors it, and re-checks status
- **AND** it repeats until `openspec status` reports every planning artifact as `done` or `skipped`
- **AND** the final structured return indicates the change reached apply-ready state

#### Scenario: One artifact is skipped by configuration

- **GIVEN** a change whose `.openspec.yaml` declares a skip for one artifact so the CLI reports it as `skipped`
- **WHEN** the apply-ready mode runs
- **THEN** it does not author any file for that skipped artifact
- **AND** the skipped artifact counts as settled for loop termination

### Requirement: The maxArtifacts cap bounds one run

Feature: plan-apply-ready-mode
Rule: The apply-ready mode SHALL accept a `maxArtifacts` argument and MUST stop authoring after the cap is reached, reporting which artifacts remain so a later run can resume without re-authoring settled artifacts.

#### Scenario: Cap reached before the change is complete

- **GIVEN** a change with three artifacts still in `ready` or `blocked` state
- **WHEN** the apply-ready mode runs with `maxArtifacts` set to one
- **THEN** it authors at most one artifact before stopping
- **AND** the return value names the remaining unfinished artifacts
- **AND** a subsequent run with a higher cap continues from the surviving state without duplicating work

#### Scenario: Cap is absent or generous

- **GIVEN** a change with fewer remaining artifacts than the effective cap
- **WHEN** the apply-ready mode runs
- **THEN** it finishes all remaining artifacts and terminates normally
- **AND** no artifact is authored twice

### Requirement: Ambiguity pauses through the checkpoint channel instead of guessing

Feature: plan-apply-ready-mode
Rule: When authoring an artifact hits an ambiguity whose answer would change what is written, the workflow SHALL batch the questions into one `ask_user_via_host` call through the checkpoint-bridge and pause the loop. If the host answers, it MUST resume with those answers; for any non-success host status it MUST return a `needs_input` result without guessing and without retrying.

#### Scenario: Host is armed and answers

- **GIVEN** the apply-ready loop is authoring an artifact and encounters an ambiguity that changes the artifact's content
- **AND** a host session with the checkpoint-bridge is available
- **WHEN** the workflow calls `ask_user_via_host` once with all questions batched
- **AND** the host returns answers with status `ok`
- **THEN** the loop resumes authoring using those answers
- **AND** the artifact is completed in the same run

#### Scenario: No host is armed

- **GIVEN** the apply-ready loop encounters a material ambiguity
- **AND** no host session is available so `ask_user_via_host` reports a non-success status
- **WHEN** the workflow handles the response
- **THEN** it does not invent an answer and does not call the host again
- **AND** it returns a structured `needs_input` result stating exactly what the host must decide
- **AND** no artifact file is written from a guessed answer

### Requirement: Only CLI-resolved artifact files are written

Feature: plan-apply-ready-mode
Rule: The apply-ready mode SHALL take each artifact's output location from the `openspec instructions` CLI (`resolvedOutputPath` / `existingOutputPaths`) and MUST NOT hardcode artifact ids or paths, MUST NOT create files for artifacts reported as skipped, and MUST NOT write any file outside the change's resolved artifact outputs.

#### Scenario: Artifact is authored at its CLI-resolved path

- **GIVEN** the CLI reports `resolvedOutputPath` for the next artifact
- **WHEN** the apply-ready mode authors that artifact
- **THEN** the file appears exactly at the CLI-resolved path
- **AND** no path was constructed from a hardcoded convention

#### Scenario: Skipped artifact produces no file

- **GIVEN** the CLI instruction for an artifact reports it as skipped
- **WHEN** the apply-ready mode processes that artifact
- **THEN** no file is created for it
- **AND** the loop continues to the next artifact
