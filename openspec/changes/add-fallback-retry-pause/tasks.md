# Tasks: add-fallback-retry-pause

## 1. Pause mechanism

- [x] 1.1 Add `RETRY_PAUSE_MS` (from `args.retryPauseMs`, default 45000, 0 disables) and the `pauseOnce(ms, label)` helper (minimal utility-model child with `gate: 'sleep <seconds> && true'`; best-effort — a failed pause child never blocks) to `workflows/openspec/openspec-apply-change.js`.
- [x] 1.2 `agentFB`: on a terminal primary `null`, log + pause (when configured), retry the PRIMARY exactly once, then proceed to the unchanged cross-provider chain.
- [x] 1.3 Apply the same `RETRY_PAUSE_MS` + `pauseOnce` + `agentFB` modification in `openspec-plan-change.js` and `openspec-validate-change.js`.

## 2. Verification

- [x] 2.1 Syntax gate: `node scripts/check-workflow-syntax.mjs` passes for all three modified workflow scripts.
- [x] 2.2 Change validates: `openspec validate add-fallback-retry-pause --type change --strict` exits 0.

## 3. Documentation

- [x] 3.1 `docs/workflows/openspec-workflows.md`: the retry pause documented in the Model tiers + fallback section (mechanism + default + disable + log line).
- [x] 3.2 README args contracts: `retryPauseMs` noted for the three workflows.
