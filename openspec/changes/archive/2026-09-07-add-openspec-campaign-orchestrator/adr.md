# ADR Review Manifest

- Status: completed
- Review date: 2026-09-06

## Review Summary

ADR review completed for this change. The campaign-orchestrator design (`design.md`, informed by `proposal.md` and `specs/campaign-orchestrator/spec.md`) was reviewed against every currently in-force ADR under `docs/adr/`.

**Disposition: coherent — no supersession, no new repository-level ADR required.**

Per-decision mapping against the in-force context:

- **Composition over redefinition (design.md Decision 1)** — directly implements ADR-0002's recorded follow-up that the future `openspec-campaign` orchestrator "composes over these semantics rather than redefining them". No divergence; no new ADR.
- **Serial scaffold, parallel plan (design.md Decision 2)** — a tactical scheduling shape inside the family's existing scope discipline; scaffolding is treated as global-mutating (same prohibition class as `archive` per ADR-0001). Durable enough to live in design.md, not a new architectural commitment.
- **One level deep, `planMode: 'one'` (design.md Decision 3)** — restates ADR-0001's "composed one level deep" rule for this member; the rejection of a `depth`/`planMode` campaign argument preserves the host's scope authority rather than changing any ADR boundary.
- **Null-as-failed per-item outcomes (design.md Decision 4)** — intentionally differs from ADR-0002's null-as-blocker, but does **not** supersede it: ADR-0002's rule is scoped to the apply pipeline, where a paused implementer is indistinguishable from silent non-work on tasks the checkbox verifier must certify; the campaign is planning-only, where a null plan-change result maps conservatively to `failed` and the host re-runs per item statelessly (ADR-0001's resumption model). This is a member-local conservative mapping, not a reversal — the safe direction is preserved in both. Recorded as tactical detail in design.md; if a future apply-campaign mode (design.md Open Questions) composes per-item apply pipelines, that mode gets its own change and its own ADR.
- **Shard-digest composition (design.md Decision 5) and discovery agent (Decision 6)** — tactical composition mechanics consistent with ADR-0001's containment argument (digest content stays out of the host session) and its checkpoint-bridge batching requirement.
- **Verbatim prompt-contract prohibition (design.md Decision 7)** — inherits ADR-0001/ADR-0002's trust model verbatim, including the already-rejected sandbox alternative; no new decision.
- **Args surface (design.md Decision 8)** — implementation detail mirroring plan-change's defensive parse.

No decision in the design establishes a long-term architectural commitment beyond what ADR-0001 and ADR-0002 already record, and none intentionally diverges from an in-force ADR at repository scope.

## In-Force ADRs Reviewed

- ADR-0001 — `docs/adr/ADR-0001-workflow-family-and-checkpoint-channel.md` (Accepted, 2026-09-06; unsuperseded) — workflow family composed one level deep, checkpoint-bridge channel, host authority over apply/archive/approvals, measured-pilot gating, scope discipline.
- ADR-0002 — `docs/adr/ADR-0002-apply-pipelines-separate-implementation-from-verification.md` (Accepted, 2026-09-06; unsuperseded; extends ADR-0001) — implementer/verifier separation, null-as-blocker in the apply pipeline, verbatim prompt-contract prohibitions, composition rule for the campaign orchestrator.

## New Durable ADRs Created

- None - no major durable architectural decisions were introduced. The campaign's serial-create/fan-out/digest shape and its null-as-failed (versus ADR-0002's null-as-blocker) semantics are recorded as tactical detail in `design.md` (Decisions 2, 4, 5); no repository-level ADR file was created and no existing ADR was modified.
