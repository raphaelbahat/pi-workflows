# Design: add-fallback-retry-pause

## Context

`add-workflow-model-fallback` (ADR-0003) switches providers immediately when a primary
terminates with `null`. The observed OpenRouter `429` is explicitly temporary ("retry
shortly"), so an immediate switch can strand a run on a fallback tier for a blip that would
have cleared. The user-approved modest hybrid: ONE bounded pause, ONE primary retry, then
the chain — no exponential schedules, no jitter, no agent-decided selection.

## Decisions

- **Pause mechanism — the gate-sleep trick.** The workflow sandbox has no sleep primitive
  and bans `Date.now`/`Math.random`. The pause is implemented as a minimal "pause child":
  `agent('Reply with exactly: paused...', { effort: 'minimal', model: MODELS.utility,
  gate: 'sleep <seconds> && true' })`. pi-subagents runs the gate command after the child
  finishes, so the child completes ~`retryPauseMs` later — a fixed, deterministic delay at
  the cost of one tiny model call per pause (pauses are rare: they fire only on terminal
  primary failures).
- **Then ONE primary retry, then the chain.** The pause covers the "retry shortly" window;
  the primary retry re-uses the tuned tier if the pool recovered. A still-failing primary
  falls through to the unchanged cross-provider chain (each hop a different pool).
- **Best-effort, bounded.** If the pause child fails (worst-case: the provider is down for
  even the minimal call), the flow proceeds immediately — the pause never blocks. At most
  ONE pause + ONE primary retry per failed call (`MAX` implicit: the code path runs once).
- **Default 45000 ms, `0` disables.** Sensible production default (blips clear in tens of
  seconds); `retryPauseMs: 0` restores the exact pre-change behavior.
- **Same helper in all three workflows** — `agentFB` is duplicated per script by design
  (no shared imports across workflow scripts), so the pause + `retryPauseMs` land in
  `openspec-apply-change.js`, `openspec-plan-change.js`, and `openspec-validate-change.js`.

## Non-goals

- Exponential backoff curves and jitter (banned/infeasible in the sandbox; low marginal
  value over pi-subagents' internal retries + one pause + cross-provider hops).
- Agent-decided model selection (chicken-and-egg during the failure; the workflow decides
  deterministically from the discovered configured-model list).
- Upstream changes to pi-subagents' internal retry policy (a backoff-policy feature request
  there is the long-term home for heavier retry strategies).