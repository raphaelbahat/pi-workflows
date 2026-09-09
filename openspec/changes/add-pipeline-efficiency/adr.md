# ADR Review Manifest

- Status: completed
- Review date: 2026-09-07

## Review Summary

ADR review completed for this change. Dependencies reviewed (one line each): `proposal.md` fixed the cost problem (4.8M/12 tasks) and the five mechanisms; `specs/pipeline-efficiency/spec.md` pinned the model-tier contract, primer production/injection, handoff rolling, resume semantics, prompt caps, and the nested-decomposition deferral; `design.md` (D1–D6) supplied the decisions evaluated against the in-force ADRs below.

Disposition: ADR-0001 and ADR-0002 remain fully coherent with this design — no supersession. The efficiency mechanisms are tactical (model tiers, primer, handoffs, resumes) and stay in design.md; the nested-decomposition deferral is recorded there with its revisit trigger, cross-referenced in ADR-0002's follow-ups. The mechanisms preserve every ADR boundary: the verifier's independence and evidence contract, host authority over archive/update, and one-level composition (D6 defers the only nesting candidate).

## In-Force ADRs Reviewed

- `docs/adr/ADR-0001-workflow-family-and-checkpoint-channel.md` — Status: Accepted. Coherent: the primer/handoff/resume mechanisms do not alter the family shape, the checkpoint channel, or the host-authority boundary; the context-discipline trust boundary reinforces ADR-0001's CLI-as-truth principle.
- `docs/adr/ADR-0002-apply-pipelines-separate-implementation-from-verification.md` — Status: Accepted (extends ADR-0001). Coherent: model tiers and the primer change WHO runs and WHAT they read first — not the implementer/verifier separation, the evidence contract, or the hard-stop semantics; the resume change preserves context while keeping the verifier external; the nested-decomposition deferral matches ADR-0002's own follow-ups.
