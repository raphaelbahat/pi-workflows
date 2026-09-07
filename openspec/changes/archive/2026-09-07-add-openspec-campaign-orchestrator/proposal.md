## Why

ADR-0001 (`docs/adr/ADR-0001-workflow-family-and-checkpoint-channel.md`) names an `openspec-campaign` orchestrator as the family's fourth member: a 10-change OpenSpec campaign run manually in one session proved that fan-out parallelizes planning well but that per-change loop logic and context growth in the main session are the dominant cost — and the host still has to hand-drive `openspec list`, serial `openspec new change` scaffolding, and per-item plan-change invocations. ADR-0002 (`docs/adr/ADR-0002-apply-pipelines-separate-implementation-from-verification.md`) arms this member: the orchestrator composes over the plan-change/apply semantics rather than redefining them.

## What Changes

- New `openspec-campaign.js`: a campaign orchestrator for N independent changes — item discovery via `openspec list` (or an explicit `items` arg), then per-item planning fan-out, ending in a digest the host reads once.
- **Serial scaffold, parallel plan**: `openspec new change` runs SERIALly per item — `new change` is a global-mutating operation on the shared changes directory, so it is never parallelized (same class of prohibition as `archive`). Planning fan-out via `workflow('openspec-plan-change')` runs one level deep per item, one plan-change invocation per item with default `planMode: 'one'` (proposals-only; the lived 10-change campaign evidence showed full authoring per item is dangerous without grill rounds — deeper authoring stays a host decision, re-invoked item by item).
- **Per-item outcome tracking with no blanket retries**: each item records exactly one outcome — `ok` (artifact written + QA passed), `needs_input` (checkpoint-bridge escalation or plan-change `needs_input` return), or `failed` (null plan-change result or resolve failure). A failed or blocked item never blocks or restarts the other items; there are no automatic retries — the host decides per item.
- **Shard-digest + composer**: each per-item shard emits a compact outcome record (item, mode, outcome, written path, question/assumption lines); a composer agent folds the shards into a single `CAMPAIGN.md` digest in the repo root with per-item outcomes, aggregate counts, and the host's next actions (which items to re-run, which need interviews, which are ready for review — never apply/archive instructions).
- Host authority unchanged per ADR-0001/ADR-0002: the orchestrator and its agents never run `openspec apply`, `openspec archive`, or `openspec update`; archive, approvals, and interviews outside plan-change's own grill channel remain main-session-only.
- README.md args contract gains an `openspec-campaign` section.

## Capabilities

### New Capabilities

- `campaign-orchestrator`: the `openspec-campaign` orchestration semantics — item discovery (`openspec list` or `items` arg), serial `openspec new change` scaffolding with the global-mutation concurrency rule, one-level-deep plan-change fan-out with default `planMode: 'one'`, per-item outcome tracking (`ok`/`needs_input`/`failed`) with no blanket retries, shard-digest composition into `CAMPAIGN.md`, and the apply/archive/update prohibition inherited from the family trust model.

### Modified Capabilities

- (none) — `openspec/specs/` contains no existing specs; plan-change's behaviour is consumed unchanged via its existing `scaffold`/`one` modes, so the campaign is introduced as a new capability rather than a delta on an existing one.

## Impact

- **Code — new `openspec-campaign.js`** (house style taken from `openspec-plan-change.js`: `export const meta` header, named phases, JSON schemas per agent, defensive args parse, structured returns; `openspec-validate-change.js` confirmed the fan-out/dimension pattern being composed here).
- **Workflow — `openspec-plan-change`** (informed the per-item invocation shape, `mode: 'one'` default, `needs_input`/null result semantics the orchestrator maps to outcomes): consumed unchanged — composition only, no edits to that file.
- **Checkpoint channel — `extensions/checkpoint-bridge/`** (per ADR-0001's serial host dialog queueing): `needs_input` outcomes carry the batched question text verbatim; the orchestrator itself asks the host at most once, batched, only when digest composition is ambiguous.
- **Docs — `README.md`**: new `openspec-campaign` args-contract section and workflow-table row.
- **ADR — `docs/adr/`**: ADR-0001's pilot gate for this member; ADR-0002's follow-up explicitly anticipates this composition — no new ADR required.
- **CI / tooling**: no dependency changes; the syntax gate remains `node scripts/check-workflow-syntax.mjs`; hygiene via prek at source (installed copies are sync outputs, never edit targets).
