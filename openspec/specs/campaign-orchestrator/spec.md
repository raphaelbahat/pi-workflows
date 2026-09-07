# campaign-orchestrator Specification

## Purpose
TBD - created by archiving change add-openspec-campaign-orchestrator. Update Purpose after archive.

## Requirements

### Requirement: Campaign item discovery
Feature: campaign-orchestrator
Rule: The orchestrator MUST resolve its item list before any per-item work begins, from an explicit `items` argument or from `openspec list`.

#### Scenario: Explicit items argument wins
- **GIVEN** the host invokes `openspec-campaign` with an `items` argument naming two changes
- **WHEN** the orchestrator resolves its campaign items
- **THEN** the campaign consists of exactly those two named changes in the given order
- **AND** no `openspec list` discovery result is merged in

#### Scenario: Discovery falls back to openspec list
- **GIVEN** the host invokes `openspec-campaign` without an `items` argument
- **WHEN** the orchestrator resolves its campaign items
- **THEN** the campaign consists of the pending changes reported by `openspec list`
- **AND** each discovered item records which discovery source produced it

#### Scenario: Empty discovery yields a degenerate campaign
- **GIVEN** `openspec list` reports no pending changes and no `items` argument was given
- **WHEN** the orchestrator resolves its campaign items
- **THEN** the campaign completes without invoking any per-item work
- **AND** the composed digest reports zero items with no aggregate failure

### Requirement: Serial scaffolding of new changes
Feature: campaign-orchestrator
Rule: `openspec new change` is a global-mutating operation on the shared changes directory and MUST run strictly serially, one item at a time — it is never parallelized (the same class of prohibition as `archive`).

#### Scenario: Scaffold steps never overlap
- **GIVEN** a campaign with three items discovered
- **WHEN** the orchestrator scaffolds each item via `openspec new change`
- **THEN** each scaffold invocation completes before the next one starts
- **AND** no two scaffold invocations are in flight at the same time

#### Scenario: Scaffold failure does not stop later scaffolds
- **GIVEN** a campaign with three items and the second item's `openspec new change` fails
- **WHEN** the orchestrator continues through the item list
- **THEN** the first and third items are still scaffolded
- **AND** the second item records a `failed` outcome without a retry

### Requirement: One-level-deep per-item planning fan-out
Feature: campaign-orchestrator
Rule: Each scaffolded item MUST be planned by invoking `workflow('openspec-plan-change')` exactly once per item, one level deep, with default `planMode: 'one'` (proposals-only). Deeper authoring remains a host decision, re-invoked item by item.

#### Scenario: Default planning is proposals-only
- **GIVEN** a scaffolded campaign item
- **WHEN** the orchestrator plans the item
- **THEN** it invokes `openspec-plan-change` once with `planMode: 'one'`
- **AND** only the proposal artifact is authored for that item by the fan-out

#### Scenario: Plan fan-out stays one level deep
- **GIVEN** a campaign item being planned
- **WHEN** the `openspec-plan-change` invocation for that item runs
- **THEN** the orchestrator does not nest further `openspec-plan-change` invocations beneath it
- **AND** any deeper authoring for the item is left to an explicit host re-invocation

#### Scenario: Plan-change result maps to a per-item outcome
- **GIVEN** a scaffolded campaign item whose `openspec-plan-change` invocation returns
- **WHEN** the orchestrator classifies the item
- **THEN** a written artifact with passed QA yields `ok`
- **AND** a `needs_input` return from `openspec-plan-change` (or a checkpoint-bridge escalation) yields `needs_input` carrying the batched question text verbatim
- **AND** a null plan-change result or a resolve failure yields `failed`

### Requirement: Per-item outcome tracking without blanket retries
Feature: campaign-orchestrator
Rule: Every item records exactly one outcome — `ok`, `needs_input`, or `failed`. A failed or blocked item MUST NOT block or restart other items, there are no automatic retries, and a skipped or absent item is never recorded as success.

#### Scenario: Blocked item does not block siblings
- **GIVEN** a campaign with three items and the first item returning `needs_input`
- **WHEN** the orchestrator continues the campaign
- **THEN** the second and third items are still planned and outcome-tracked
- **AND** the first item's outcome remains `needs_input` with its question preserved

#### Scenario: No automatic retry of a failed item
- **GIVEN** a campaign item whose planning returned `failed`
- **WHEN** the orchestrator finishes the item
- **THEN** the item's outcome stays `failed` in its shard record
- **AND** the orchestrator does not re-invoke planning for that item — the host decides any re-run

#### Scenario: Skipped item is never recorded as success
- **GIVEN** a campaign item that produced no artifact because it was skipped
- **WHEN** the orchestrator records the item's outcome
- **THEN** the outcome is not `ok`
- **AND** the shard record states why nothing was written

### Requirement: Shard digest composed into CAMPAIGN.md
Feature: campaign-orchestrator
Rule: Each item MUST emit a compact shard record (item, mode, outcome, written path, question/assumption lines), and a composer agent MUST fold the shards into a single `CAMPAIGN.md` digest in the repo root with per-item outcomes, aggregate counts, and the host's next actions — never apply/archive instructions.

#### Scenario: Shards fold into one digest
- **GIVEN** a campaign whose items each emitted a shard record
- **WHEN** the composer runs
- **THEN** a single `CAMPAIGN.md` exists in the repo root
- **AND** it lists each item's outcome and written path, aggregate counts per outcome, and next actions per item (re-run, interview, or ready for review)

#### Scenario: Digest never directs implementation
- **GIVEN** a composed `CAMPAIGN.md` with items in `ok` and `needs_input` states
- **WHEN** the host reads the digest's next actions
- **THEN** the actions name re-runs, interviews, and review readiness only
- **AND** the digest contains no apply, archive, or update instructions

#### Scenario: Ambiguous digest composition escalates once
- **GIVEN** shard records whose composition into `CAMPAIGN.md` is ambiguous
- **WHEN** the orchestrator must resolve the ambiguity to compose the digest
- **THEN** it asks the host at most once, with all questions batched
- **AND** if no host answer is available, the digest records the ambiguity instead of guessing

### Requirement: Apply, archive, and update prohibition
Feature: campaign-orchestrator
Rule: The orchestrator and its agents MUST NEVER run `openspec apply`, `openspec archive`, or `openspec update`; archive, approvals, and interviews outside plan-change's own grill channel remain main-session-only per ADR-0001 and ADR-0002.

#### Scenario: Campaign items are scaffolded and planned but never applied
- **GIVEN** a campaign item that reached `ok` with a written proposal
- **WHEN** the orchestrator finishes that item
- **THEN** the item's change remains unapplied and unarchived
- **AND** no orchestrator or agent step has invoked `openspec apply`, `openspec archive`, or `openspec update`

#### Scenario: Prohibition holds even when items are all complete
- **GIVEN** a campaign where every item recorded `ok`
- **WHEN** the campaign completes and the digest is composed
- **THEN** the digest directs the host to review and decide on apply/archive in the main session
- **AND** the campaign performs no implementation, sync, or archive state change itself
