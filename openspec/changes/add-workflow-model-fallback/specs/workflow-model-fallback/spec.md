# Delta Spec: workflow-model-fallback

## ADDED Requirements

### Requirement: Workflow-level model fallback on terminal provider failure

The OpenSpec workflow scripts SHALL wrap every child `agent()` call in an `agentFB`
helper that, when the primary model's call resolves to `null` (the terminal case after
pi-subagents' internal retries — e.g. OpenRouter shared-pool `429`), retries the SAME
prompt with the SAME options down a fallback chain routed to different providers.

#### Scenario: Primary model rate-limited, fallback serves the call

- **WHEN** an `agentFB`-wrapped call on the primary model resolves to `null`
- **THEN** the workflow retries the identical call with the next fallback model whose
  provider differs from the failed primary
- **AND** the workflow logs a `fallback hop` line naming the failed model and the chosen
  fallback for auditability

#### Scenario: Fallback chain exhausted

- **WHEN** every model in the fallback chain also resolves to `null`
- **THEN** `agentFB` resolves to `null` and the surrounding workflow logic treats the
  call exactly as it does today (blocked/deferred/reported), never looping

### Requirement: Fallback chains are cross-provider and host-override-aware

Fallback chains SHALL be hardcoded defaults (no run-time discovery dependency), ordered
so each hop routes to a different provider than the model that just failed, SHALL skip
the failed primary, and SHALL respect host model overrides — the chain adapts around
whatever primary the host configured.

#### Scenario: Host-configured primary still gets fallbacks

- **WHEN** the host passes `utilityModel: some/custom-model`
- **THEN** the fallback chain for that call is the known-good default set, filtered to
  configured models, excluding the primary

### Requirement: Secret-free run-time discovery in the apply Load phase

The workflows SHALL discover the configured provider/model table (via a minimal child
running `pi --list-models`, CLI output only) LAZILY — once per run, at the FIRST terminal
fallback need, never eagerly at Load (eager discovery made every Load child probe
`pi --list-models` multiple times and ingest the full model table even on error-free runs).
The discovered list SHALL be cached module-level (`AUTHENTICATED_MODELS`). The workflows
SHALL NOT read `auth.json` or `models.json` (they contain user secrets). `agentFB` SHALL
filter fallback chains to models present in the discovered list when available; absent or
unparseable discovery SHALL NOT block the run (chains fall back to their hardcoded
defaults). Authentication itself is enforced by the retry: a fallback model without
working auth fails fast and the chain advances. When `args.retryPauseMs > 0`, the
discovery child doubles as the ADR-0004 pause (its `gate` runs `sleep <seconds> && true`).

#### Scenario: Discovery filters an unconfigured fallback

- **WHEN** the first terminal failure triggers lazy discovery and the discovered list
  excludes a fallback entry
- **THEN** `agentFB` skips that fallback and tries the next chain entry

#### Scenario: Discovery unavailable does not block

- **WHEN** the Load child cannot produce `authenticated_models` (CLI failure, parse failure)
- **THEN** the run proceeds with the hardcoded chains unchanged and the report notes the
  discovery miss

### Requirement: All OpenSpec workflows get the mechanism

The `agentFB` helper and fallback chains SHALL be implemented in `openspec-apply-change.js`,
`openspec-plan-change.js`, and `openspec-validate-change.js` alike, so no member of the
family can abort on a single provider's rate limit.

#### Scenario: Plan/validate runs survive a primary outage

- **WHEN** a plan or validate child on its primary model resolves to `null`
- **THEN** the call is retried down the same cross-provider chain before the workflow
  treats the call as failed
