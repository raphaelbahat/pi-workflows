# Design: add-workflow-model-fallback

## Context

The OpenSpec workflow family drives long production runs through dozens of child
`agent()` calls on flash-tier models routed via OpenRouter. OpenRouter's shared
upstream pools rate-limit per model (`429`, e.g. `qwen/qwen3.8-flash is temporarily
rate-limited upstream`, provider_name Alibaba/Makora, `limit_source:
upstream_provider_shared_pool`). pi-subagents retries transient failures internally;
when it gives up, the workflow-level `agent()` call resolves to `null`. Today a single
terminal failure aborts a whole change (`load-failed`, `status-failed`) or defers a task.

Pi provides programmatic, secret-free discovery of configured/authenticated models —
verified against the installed `@earendil-works/pi-coding-agent` docs:
`modelRuntime.getAvailable()` (SDK, `docs/sdk.md`: "Get only models that have valid
authentication configured"), the RPC verb `get_available_models` (`docs/rpc.md`), and the
CLI table `pi --list-models` (exit 0 verified live 2026-09-13). The workflow engine
sandbox cannot import the SDK, and RPC mode targets external clients — so the
workflow-grade surface is the CLI table, read by a child agent via ctx_shell.

## Goals

- D1 — `agentFB(prompt, opts)`: wrap every child call in the three OpenSpec workflow
  scripts. On a `null` primary result, retry the identical call down a hardcoded
  cross-provider chain; log every hop; never loop (chain exhausts → `null`, existing
  handling applies).
- D2 — secret-free discovery in the apply Load phase: the Load child runs
  `pi --list-models` (NEVER reading `auth.json`/`models.json` — user secrets) and
  returns the configured provider/model pairs as `snapshot.authenticated_models`
  (array of `provider/model` ids). `agentFB` filters chains to that list when present.
- Host overrides (`implementerModel`, `verifierModel`, `utilityModel`, `authorModel`)
  remain the primary; chains adapt around the resolved primary.

## Decisions

- D1: **Hardcoded chains, engine-level filter.** `FALLBACKS` maps each known primary to
  its cross-provider chain (`qwen/qwen3.8-flash` → `deepseek/deepseek-v4-flash-0731` →
  `z-ai/glm-5.3-flash`; deepseek and glm primaries get the mirrored chain). Unknown
  host primaries get the default set minus the primary. When a discovered configured
  list exists, the chain is filtered to it (D2); otherwise the hardcoded chain stands
  (discovery must never block — its absence is logged and non-fatal).
- D2: **Lazy CLI discovery (amended 2026-09-14).** The ORIGINAL eager design ran discovery in
  the Load phase — production showed Load children probing `pi --list-models` 2–6× per run and
  ingesting the full 466-model table (~30 KB) even on error-free runs. Discovery is now LAZY:
  `agentFB` triggers it once, at the FIRST terminal fallback need, via a combined
  "pause+discovery" child (the child parses the CLI table into `provider/model` ids cached as
  `AUTHENTICATED_MODELS`; when `args.retryPauseMs > 0` the child's `gate` also enforces the
  ADR-0004 pause). Authenticated-ness is enforced by the retry (a fallback lacking auth fails
  fast; the chain advances) — the discovered list is a configuration sanity filter, matching
  the user-approved CLI mechanism rather than `getAvailable()` (SDK-only) or
  `get_available_models` (RPC-mode clients), which workflows cannot reach.
- Resume semantics: a fallback attempt drops `resume` (and `gate`, which cannot combine
  with a fresh spawn) — the fallback child starts fresh; prompts are self-contained by
  construction.
- Wrap-once: every child `agent(` call site in the three scripts becomes `agentFB(`.
  No pi-subagents changes; transient retries stay where they belong.

## Non-goals

- Provider-key management, BYOK setup, or any secret-file handling.
- Dynamic chain reordering mid-run based on observed latency/cost.
- Applying the mechanism outside the OpenSpec workflow family.
