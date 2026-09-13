# Validation: add-fallback-retry-pause

## Gate record

- `openspec validate add-fallback-retry-pause --type change --strict` — **PASSED (exit 0)**, 2026-09-13, host-run after implementation.
- `node scripts/check-workflow-syntax.mjs` — **OK** for all three modified workflow scripts, 2026-09-13.

## Verdict

`VERDICT: READY`

> **Implementation notes (2026-09-13):** `RETRY_PAUSE_MS` (default 45000, `0` disables) +
> `pauseOnce` (minimal utility-model child, `gate: 'sleep <seconds> && true'`, best-effort)
> implemented in all three OpenSpec workflow scripts; `agentFB` now pauses once and retries
> the primary exactly once before entering the cross-provider chain. No jitter, no
> `Date.now`, no secret-file reads; `onUnansweredEscalation` and the fallback chain order
> unchanged.