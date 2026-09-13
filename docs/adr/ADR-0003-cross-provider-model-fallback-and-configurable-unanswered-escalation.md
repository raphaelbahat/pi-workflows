# ADR-0003: Cross-provider model fallback and a configurable unanswered-escalation policy

## Status

Accepted (2026-09-13). Extends ADR-0002 (implement/verify separation, hard stop on the first blocker) by making the hard-stop behavior configurable when the bridge goes unanswered, and by adding run-time model resilience.
- **Context:** Production OpenSpec runs depend on OpenRouter shared-pool flash models;
  upstream `429` rate limits terminate children (`agent()` → `null`) and abort runs.
- **Decision:** Workflows wrap every child call in `agentFB`, retrying terminal failures
  down hardcoded cross-provider chains; the apply Load phase discovers configured models
  via the secret-free CLI table `pi --list-models` (child-run, never `auth.json`/
  `models.json`) and `agentFB` filters chains to it.
- **Alternatives rejected:**
  - *SDK `modelRuntime.getAvailable()`* — the canonical authenticated-model API, but the
    workflow engine sandbox cannot import the SDK; reserved for extension-grade solutions.
  - *RPC `get_available_models`* — targets external RPC-mode clients, not workflow children.
  - *Reading `auth.json`/`models.json`* — rejected on secrets hygiene (user keys live there).
- **Consequences:** single-provider saturation no longer aborts runs; every fallback hop is
  logged for audit; fallback children start fresh (resume dropped) — prompts must stay
  self-contained; an unauthenticated fallback fails fast and the chain advances.