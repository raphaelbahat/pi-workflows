# Validation: add-workflow-model-fallback

## Gate record

- `openspec validate add-workflow-model-fallback --type change --strict` — **PASSED (exit 0)**, 2026-09-13, host-run after implementation.
- `node scripts/check-workflow-syntax.mjs` — **OK** for all three modified workflow scripts, 2026-09-13.

## Verdict

`VERDICT: READY`

> **Implementation notes (2026-09-13):** D1 `agentFB` + cross-provider `FALLBACKS` chains
> implemented in all three workflow scripts; D2 secret-free discovery via the Load child's
> `pi --list-models` run (snapshot field `authenticated_models`), chains filtered to the
> discovered list when present. No `auth.json`/`models.json` reads anywhere. Host model
> overrides remain primary; unknown primaries get the default chain minus the primary.