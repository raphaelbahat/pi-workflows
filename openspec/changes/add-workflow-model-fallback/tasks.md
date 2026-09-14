# Tasks: add-workflow-model-fallback

## 1. Fallback mechanism (D1)

- [x] 1.1 Add `FALLBACKS` map, `chainFor(primary)`, and the `agentFB(prompt, opts)` helper (null → cross-provider chain retry, per-hop `fallback hop` log, resume/gate dropped on fallback hops) to `workflows/openspec/openspec-apply-change.js`.
- [x] 1.2 Wrap every child `agent(` call site in `openspec-apply-change.js` with `agentFB(` (load, primer, status, implementer, verifier, resumed verifier, escalate, self-fix, final).
- [x] 1.3 Apply the same helper + wrapping in `openspec-plan-change.js` (all child calls) and `openspec-validate-change.js` (snapshot, reviewers, gate, compose).

## 2. Run-time discovery (D2)

- [x] 2.1 (amended 2026-09-14 to LAZY) Discovery child (via `agentFB` failure path, all three workflows): run `ctx_shell 'pi --list-models'`, parse the provider/model table into `provider/model` ids, cache as `AUTHENTICATED_MODELS`; never read `auth.json`/`models.json`; never run eagerly at Load.
- [x] 2.2 `agentFB` filters the fallback chain to the discovered configured list when present (lazy discovery fires at the first terminal failure, once per run); absent/unparseable discovery is logged and non-blocking (hardcoded chains stand).

## 3. Verification

- [x] 3.1 Syntax gate: `node scripts/check-workflow-syntax.mjs` passes for all three modified workflow scripts.
- [x] 3.2 Change validates: `openspec validate add-workflow-model-fallback --type change --strict` exits 0.
- [x] 3.3 Docs: `docs/` note (or README section) records the mechanism and the audit log line format.