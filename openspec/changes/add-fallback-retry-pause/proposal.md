# Proposal: add-fallback-retry-pause

## Why

The cross-provider fallback introduced by `add-workflow-model-fallback` switches models the
moment a primary terminates with `null`. But the observed OpenRouter failure is explicitly
*temporary* — the `429` payload says `qwen/qwen3.8-flash is temporarily rate-limited upstream.
Please retry shortly` — and pi-subagents' internal retries do not necessarily outlast the
saturation window. Switching providers immediately is correct for hard outages, but it
needlessly leaves the tuned primary tier for blips that would clear within seconds.

## What Changes

- Add ONE bounded pause to `agentFB`: when the primary resolves to `null` and a pause is
  configured, the workflow spawns a minimal "pause child" whose `gate` runs
  `sleep <seconds> && true` (deterministic fixed duration — no jitter, no `Math.random`),
  then retries the PRIMARY exactly once, and only then proceeds to the existing
  cross-provider fallback chain.
- Configure the pause via `args.retryPauseMs` (milliseconds, default `45000`, `0` disables).
  Applies to all three OpenSpec workflow scripts (`openspec-apply-change`,
  `openspec-plan-change`, `openspec-validate-change`).
- The pause is best-effort: if the pause child itself fails (provider error at the worst
  moment), the run continues immediately to the primary retry / chain without blocking.

## Impact

- Affected specs: `specs/workflow-resilience/spec.md` (new capability).
- Affected code: the `agentFB` helper + a `pauseOnce` helper in
  `workflows/openspec/openspec-apply-change.js`, `openspec-plan-change.js`,
  `openspec-validate-change.js`; a new `retryPauseMs` args contract line in all three.
- Behavioral impact: a terminal provider failure first waits out the "retry shortly" window
  and re-tries the tuned primary once; only a still-failing primary falls through to the
  cross-provider chain. At most ONE pause + ONE primary retry per failed call — bounded.
- Out of scope: exponential backoff schedules, jitter (`Math.random` is banned in workflow
  scripts for resume determinism), agent-decided model selection, changes to pi-subagents
  (its own retry policy remains the first line; an upstream backoff-policy feature request
  is the long-term home for heavier policies).
