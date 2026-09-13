# Proposal: add-workflow-model-fallback

## Why

Production runs of the OpenSpec workflow family hit OpenRouter shared-pool rate limits
upstream. The observed failure (2026-09-11..13) is a provider `429` — e.g.
`qwen/qwen3.8-flash is temporarily rate-limited upstream` — whose own remedy hint is
"retry shortly, add your own provider key, or route to another provider". When the
provider pool stays saturated, pi-subagents exhausts its internal retries and the
workflow's `agent()` call resolves to `null`, which today aborts the whole change
(`status-failed`, `load-failed`) or defers a task — even though a *different provider*
could serve the same call immediately.

Pi documentation (verified against the installed `@earendil-works/pi-coding-agent` docs)
provides programmatic, secret-free model-discovery surfaces: `modelRuntime.getAvailable()`
(`docs/sdk.md`) returns only models with valid authentication configured, the RPC protocol
exposes `get_available_models` (`docs/rpc.md`), and the CLI exposes `pi --list-models`
(configured-model table, exit 0 verified live). None of these require reading
`auth.json` or `models.json`, and the workflows must not read those files because they
contain user secrets.

## What Changes

- Add a run-time fallback mechanism to the OpenSpec workflow scripts (`openspec-apply-change`,
  `openspec-plan-change`, `openspec-validate-change`): an `agentFB` wrapper around every
  child `agent()` call that retries the SAME call down a hardcoded, cross-provider fallback
  chain when the primary model terminates with `null`.
- Add secret-free run-time discovery to `openspec-apply-change`: the Load child runs
  `pi --list-models` (CLI output only — never `auth.json`/`models.json`) and returns the
  configured provider/model table in its snapshot; `agentFB` filters fallback chains to
  models that are actually configured on this machine.
- Keep all host model overrides (`authorModel`, `implementerModel`, `verifierModel`,
  `utilityModel`) authoritative; fallback chains adapt around the resolved primary.
- No changes to pi-subagents itself: pi-subagents already retries transient errors
  internally; this change covers only the terminal (`null`) case at the workflow level.

## Impact

- Affected specs: `specs/workflow-model-fallback/spec.md` (new capability).
- Affected code:
  - `workflows/openspec/openspec-apply-change.js` (helper + Load discovery + call wrapping)
  - `workflows/openspec/openspec-plan-change.js` (helper + call wrapping)
  - `workflows/openspec/openspec-validate-change.js` (helper + call wrapping)
- Behavioral impact: a terminal provider failure on one model no longer aborts a workflow
  run — the call is retried on a fallback model routed to a different provider; digests log
  every fallback hop for auditability.
- Out of scope: modifying pi-subagents, provider-key management, non-OpenSpec workflow
  scripts.