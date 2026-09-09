## ADDED Requirements

### Requirement: Model tiers are args-configurable with flash defaults

Feature: pipeline-efficiency
Rule: The apply and plan pipelines SHALL accept `implementerModel`, `verifierModel`, `utilityModel`, and `authorModel` arguments, MUST default them to flash-tier models (`deepseek/deepseek-v4-flash-0731` for implementers; `qwen/qwen3.8-flash` for verifiers and utility agents), and MUST apply the configured model and effort tier to every agent dispatch of that role.

#### Scenario: Defaults apply without arguments

- **GIVEN** a run with no model arguments
- **WHEN** the pipeline dispatches implementer, verifier, and utility agents
- **THEN** implementers run on `deepseek/deepseek-v4-flash-0731` at effort `high`
- **AND** verifiers run on `qwen/qwen3.8-flash` at effort `medium`
- **AND** utility agents run on `qwen/qwen3.8-flash` at effort `low`–`medium`

#### Scenario: The host overrides a tier per run

- **GIVEN** the host passes `implementerModel: <pro-tier model>` for a demanding change
- **WHEN** implementer agents are dispatched
- **THEN** they run on the host-provided model
- **AND** the other tiers keep their defaults

### Requirement: A context primer distills design and specs once per run

Feature: pipeline-efficiency
Rule: The Load phase SHALL produce a context primer — a distillation of `design.md`, the capability specs, and the apply instruction excerpt, capped at ~1,500 tokens — and MUST inject it into every implementer and verifier prompt. Agents SHALL be instructed to prefer the primer over re-reading design/spec files, with the explicit trust boundary that the primer is guidance and files remain the truth.

#### Scenario: The primer is produced once and reused

- **GIVEN** a planning-complete change with a large design document
- **WHEN** the pipeline's Load phase runs
- **THEN** exactly one primer agent reads the design/spec sources for the whole run
- **AND** every subsequent implementer and verifier prompt carries the primer
- **AND** implementer prompts instruct: prefer the primer; re-read design/spec sections only when the primer is insufficient for the assigned task

#### Scenario: The primer is guidance, not authority

- **GIVEN** a primer entry that contradicts the current files
- **WHEN** an agent needs the authoritative answer
- **THEN** the agent reads the file (the trust boundary is stated in its prompt)
- **AND** the CLI and checkbox state remain the only sources of truth for progress

### Requirement: Rolling handoffs carry working context between agents

Feature: pipeline-efficiency
Rule: Implementer and verifier structured outputs SHALL include a `handoff` field (≤200 words: what was done, key facts, gotchas, next-task hints), and the pipeline MUST roll the last 2–3 handoffs into subsequent agent prompts as compact, size-capped context. Handoffs are GUIDANCE; a skipped or failed item is never disguised by them.

#### Scenario: Handoffs roll forward

- **GIVEN** task 1.2's implementer and verifier each returned a handoff
- **WHEN** task 1.3's implementer is dispatched
- **THEN** its prompt carries the last 2–3 handoffs, compact and attributed
- **AND** the prompt states they are guidance and the files are the truth

#### Scenario: Handoffs stay size-capped

- **GIVEN** an agent returns a handoff exceeding ~200 words
- **WHEN** the pipeline rolls it forward
- **THEN** it is truncated to the cap before injection

### Requirement: Corrective implementer passes resume the same child

Feature: pipeline-efficiency
Rule: When a blocked implementer's escalation succeeds (host status `ok`), the pipeline SHALL resume the SAME child via `resume` (context preserved) instead of cold re-spawning, MUST NOT attach a `schema` or `gate` to the resumed call (engine constraint), and MUST route the resumed output through the independent checkbox verifier as usual — the verifier remains a fresh, independent spawn.

#### Scenario: Blocker resume preserves context

- **GIVEN** task N's implementer reported paused and the escalation returned `ok` with decisions
- **WHEN** the pipeline resumes the implementer
- **THEN** the resumed call uses `resume` with the implementer's label (context preserved)
- **AND** the resumed output is text (no schema on a resumed child) and is routed to the independent verifier

#### Scenario: Verifier independence is preserved

- **GIVEN** a resumed implementer pass
- **WHEN** the checkbox verifier is dispatched
- **THEN** it is a fresh, independent spawn (never a resumed child of the implementer)
- **AND** it verifies against the task description and files, with `evidence[]`

### Requirement: Nested sub-agent decomposition is deferred with a recorded revisit trigger

Feature: pipeline-efficiency
Rule: Nested sub-agent decomposition of implementer work (with `steer_subagent`) SHALL be deferred — not implemented in this change — and the deferral MUST record its revisit trigger: when measured runs show individual implementation tasks exceeding the implementer's context budget (e.g., tasks touching more than ~5 files or requiring exploration that overflows the implementer's own context), the nested mechanism is revisited with its own measured pilot.

#### Scenario: The deferral is recorded

- **GIVEN** the pipeline-efficiency design
- **WHEN** the mechanisms are reviewed
- **THEN** nested sub-agent decomposition + `steer_subagent` are recorded as DEFERRED, with the revisit trigger stated
- **AND** no workflow code implements nested implementer decomposition in this change
