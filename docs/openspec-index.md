# OpenSpec Index

The OpenSpec inventory of this repo. Related: [Development and
Maintenance](development-and-maintenance.md) (how changes are authored/validated) and
[Workflows — OpenSpec group](workflows/openspec-workflows.md) (the engine that drives them).

## ADRs (`docs/adr/`)

- **ADR-0001** — Workflow family with a checkpoint-bridge user-interaction channel for OpenSpec
  integration (pi.events proved session-scoped; the bridge relays over a process-global bus).
- **ADR-0002** — Apply pipelines separate implementation from verification and stop hard on the
  first blocker (the implementer never marks its own checkbox).
- **ADR-0003** — Cross-provider model fallback and a configurable unanswered-escalation policy
  (`agentFB` chains + `onUnansweredEscalation: defer | fix`).

## Capability specs (`openspec/specs/`)

- `apply-pipeline` — the per-task implement/verify pipeline contract.
- `campaign-orchestrator` — serial scaffolds + one-level plan fan-out.
- `pipeline-efficiency` — model tiers, context primer, rolling handoffs, true-resume.
- `plan-apply-ready-mode` — the apply-ready authoring loop.

## Changes

- **Active**: `add-workflow-model-fallback` (implemented 2026-09-13; strict-valid; see ADR-0003).
- **Archived** (`openspec/changes/archive/`): `add-openspec-apply-pipeline`,
  `add-openspec-campaign-orchestrator`, `add-pipeline-efficiency`.

Archive policy: `openspec archive` / `openspec update` are main-session-only — the host runs
them after review; workflow agents never archive.