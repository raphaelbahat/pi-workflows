# Tasks: add-workflow-model-fallback

## 1. Fallback mechanism (D1)

- [x] 1.1 Add `FALLBACKS` map, `chainFor(primary)`, and the `agentFB(prompt, opts)` helper (null → cross-provider chain retry, per-hop `fallback hop` log, resume/gate dropped on fallback hops) to `workflows/openspec/openspec-apply-change.js`.
- [x] 1.2 Wrap every child `agent(` call site in `openspec-apply-change.js` with `agentFB(` (load, primer, status, implementer, verifier, resumed verifier, escalate, self-fix, final).
- [x] 1.3 Apply the same helper + wrapping in `openspec-plan-change.js` (all child calls) and `openspec-validate-change.js` (snapshot, reviewers, gate, compose).

## 2. Run-time discovery (D2)

- [x] 2.1 Load prompt in `openspec-apply-change.js`: run `ctx_shell 'pi --list-models'`, parse the provider/model table into `provider/model` ids, return them as snapshot field `authenticated_models`; never read `auth.json`/`models.json`.
- [x] 2.2 `agentFB` filters the fallback chain to the discovered configured list when present (post-Load call sites pass the snapshot list); absent/unparseable discovery is logged and non-blocking (hardcoded chains stand).

## 3. Verification

- [x] 3.1 Syntax gate: `node scripts/check-workflow-syntax.mjs` passes for all three modified workflow scripts.
- [x] 3.2 Change validates: `openspec validate add-workflow-model-fallback --type change --strict` exits 0.
- [x] 3.3 Docs: `docs/` note (or README section) records the mechanism and the audit log line format.