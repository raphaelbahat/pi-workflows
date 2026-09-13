# ADR-0004: Bounded retry pause before fallback model switching

- **Status:** Accepted (2026-09-13)
- **Context:** The `agentFB` cross-provider fallback (ADR-0003) switches providers on the
  first terminal failure, but the observed OpenRouter `429` is explicitly temporary
  ("retry shortly"). Immediate switching can strand runs on a fallback tier for blips that
  would clear in seconds; heavier retry policies (exponential backoff + jitter) are
  infeasible in the workflow sandbox (no sleep primitive; `Date.now`/`Math.random` banned
  for resume determinism).
- **Decision:** ONE bounded pause (a minimal "pause child" whose `gate` runs
  `sleep <seconds> && true`, `args.retryPauseMs`, default 45000 ms, 0 disables), then ONE
  primary retry, then the unchanged cross-provider chain. Best-effort: a failed pause child
  never blocks. All three OpenSpec workflow scripts get the mechanism.
- **Alternatives rejected:** exponential backoff + jitter (sandbox constraints + wall-clock
  compounding in serial pipelines); agent-decided model switching (chicken-and-egg during the
  failure; the workflow decides deterministically); modifying pi-subagents' internal retry
  policy (upstream feature request is the long-term home).
- **Consequences:** short upstream blips now re-attach to the tuned primary tier; hard
  outages pay one pause (~45 s) + one primary retry before the chain engages; one tiny model
  call is spent per pause (rare by construction — terminal failures only).