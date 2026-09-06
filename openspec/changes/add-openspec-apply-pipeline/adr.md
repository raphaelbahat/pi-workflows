# ADR Review Manifest

- Status: completed
- Review date: 2026-09-06

## Review Summary

ADR review completed for this change.

Dependencies reviewed (one line each): `proposal.md` motivated both pipeline members and fixed the host-authority boundary; `specs/plan-apply-ready-mode/spec.md` fixed loop termination, `maxArtifacts`, pause/resume, and CLI-resolved paths; `specs/apply-pipeline/spec.md` fixed the implementer/verifier split, hard-stop escalation, and the archive/update prohibition; `design.md` (D1–D8) supplied the decisions evaluated against the in-force ADRs below.

Disposition: ADR-0001 remains fully coherent with this design — no supersession. The durable decisions that were not already captured by an in-force ADR (agent-separation contract, blocker semantics, optional isolation/test-gate shape) are recorded in one new repository-level ADR; remaining design points (`apply-ready` as a mode, stateless pause/resume, CLI-as-source-of-truth, named phases) follow ADR-0001's established family rules and stay in design.md as tactical detail.

## In-Force ADRs Reviewed

- `docs/adr/ADR-0001-workflow-family-and-checkpoint-channel.md` — accepted and in force; the only ADR in the repository (no Supersedes links exist; highest sequence in use is 0001). Reviewed for: family composition rules, the checkpoint-bridge channel and its process-global bus, host ownership of approvals/archive/update, question batching, and the pilot gate this change satisfies.

## New Durable ADRs Created

- `docs/adr/ADR-0002-apply-pipelines-separate-implementation-from-verification.md` — accepted; extends ADR-0001 without superseding it. Records the apply-pipeline contract: distinct implementer and checkbox-verifier agents over `openspec instructions apply --json` (implementer never marks its own box), null/paused results treated as blockers with hard stop and one batched `ask_user_via_host` escalation, optional run-level worktree isolation and test gate defaulting off, and the inherited archive/update prohibition.
