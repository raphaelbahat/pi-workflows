# Delta Spec: workflow-resilience

## ADDED Requirements

### Requirement: Bounded pause before fallback model switching

When an `agentFB`-wrapped call on the primary model resolves to `null` and
`args.retryPauseMs` is greater than zero, the workflow SHALL spawn ONE minimal pause child
whose `gate` command is `sleep <retryPauseMs/1000> && true`, then retry the PRIMARY call
exactly once, and only then proceed to the cross-provider fallback chain. At most ONE pause
and ONE primary retry SHALL occur per failed call.

#### Scenario: Short upstream blip clears during the pause

- **WHEN** the primary's call terminates with `null`, the configured pause elapses, and the
  primary retry succeeds
- **THEN** the call returns the primary model's result and the fallback chain is never entered

#### Scenario: Saturation persists through the pause

- **WHEN** the primary retry after the pause still resolves to `null`
- **THEN** the existing cross-provider fallback chain runs unchanged (each hop being a
  different-pool retry)

### Requirement: Deterministic, secret-free pause mechanism

The pause SHALL be a fixed duration taken from `args.retryPauseMs` (default `45000`,
`0` disables) enforced by the pause child's `gate` command (`sleep <seconds> && true`) —
no `Math.random` jitter, no `Date.now`, no reading of secret-bearing files. The pause child
SHALL be a minimal utility-model call and the pause SHALL be best-effort: a failed pause
child SHALL NOT block the run (the flow proceeds to the primary retry / chain immediately),
and the pause SHALL be logged (`retry pause: <ms>ms before retrying/fallback`).

#### Scenario: Pause child fails at the worst moment

- **WHEN** the pause child itself terminates with an error (e.g. the provider is down for
  even the minimal call)
- **THEN** the workflow logs the miss and proceeds immediately to the primary retry / chain

### Requirement: Host-configurable, off-switchable

`args.retryPauseMs` SHALL be accepted by `openspec-apply-change`, `openspec-plan-change`,
and `openspec-validate-change` alike (default `45000`; `0` disables the pause entirely).
The mechanism SHALL NOT change the fallback chain order, the discovery filtering, or the
`onUnansweredEscalation` policy.

#### Scenario: Pause disabled

- **WHEN** the host passes `retryPauseMs: 0`
- **THEN** a terminal primary failure flows directly to the fallback chain with no pause and
  no primary retry, matching the pre-change behavior exactly
