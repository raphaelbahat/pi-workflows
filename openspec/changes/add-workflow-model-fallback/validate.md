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
> **Amended 2026-09-14 (lazy discovery):** D2 discovery moved from eager Load-phase to lazy
> first-failure (`agentFB` failure path), after production Load children probed
> `pi --list-models` 2–6× per run and ingested the full 466-model table (~30 KB) on error-free
> runs. Strict re-validation passed post-amendment.
