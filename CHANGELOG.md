# Changelog

## [1.10.0](https://github.com/raphaelbahat/pi-workflows/compare/v1.9.0...v1.10.0) (2026-09-13)


### Features

* add-fallback-retry-pause (ADR-0004) — bounded gate-sleep pause + primary retry before fallback switching, all three workflows; docs: aligned with README revisions (tracked install, valid target dirs), openspec-index to directory pointers, validation-history removed per review ([ec4b6ce](https://github.com/raphaelbahat/pi-workflows/commit/ec4b6ce941d131566b7a088b4b890781fe4051ef))

## [1.9.0](https://github.com/raphaelbahat/pi-workflows/compare/v1.8.0...v1.9.0) (2026-09-13)


### Features

* handoff look-up hints (per-file grep keyword + changed line range, keyword preferred) + up-to-three ranked must-know items (1 = most critical); &lt;=200 kept — context-at-reach for the next implementer/verifier sub-agent ([49c92ed](https://github.com/raphaelbahat/pi-workflows/commit/49c92edb018b3ef5245faeb3477812c2979f9d82))

## [1.8.0](https://github.com/raphaelbahat/pi-workflows/compare/v1.7.2...v1.8.0) (2026-09-13)


### Features

* add-workflow-model-fallback — agentFB cross-provider fallback chains in all three OpenSpec workflows + secret-free pi --list-models discovery filtering (429 remedy: route to another provider; never reads auth.json/models.json) ([32797e6](https://github.com/raphaelbahat/pi-workflows/commit/32797e62352730893b3224eda0691e663ae907af))
* analyze-subagent-transcripts.mjs — deterministic transcript diagnostics (tool distribution, token totals, context hogs, loop signatures, ctx_* adoption); live run identified the run-2 loop as 2064x degenerate blocked-snapshot StructuredOutput ([14e2561](https://github.com/raphaelbahat/pi-workflows/commit/14e2561055f614b89d1ea3c4da19f0410272df01))
* handoff prompts written FOR THE NEXT SUB-AGENT — name the next role (verifier/next implementer), require paths+decisions+gotchas+test-state+the-one-thing (context at reach, per review) ([af8e29a](https://github.com/raphaelbahat/pi-workflows/commit/af8e29ac279915ca71823230f113f8b4bd838b1f))

## [1.7.2](https://github.com/raphaelbahat/pi-workflows/compare/v1.7.1...v1.7.2) (2026-09-13)


### Bug Fixes

* CTX TIMING NOTE — a not-found ctx_* tool may be pre-registration (lean-ctx bridge connects async); children retry after a few turns (confirmed: campaign child ctx_grep isError 'Tool ctx_grep not found' on first search, 0 extension-errors) ([7737bb4](https://github.com/raphaelbahat/pi-workflows/commit/7737bb4d3039ef4999db53095378d217b27a7b3d))

## [1.7.1](https://github.com/raphaelbahat/pi-workflows/compare/v1.7.0...v1.7.1) (2026-09-13)


### Bug Fixes

* SHELL & SEARCH hard rule — every command via ctx_shell, every search via ctx_grep, reads via ctx_read/bounded ranges; bash/grep only on not-found with disclosure (adherence was ~1%: 453 bash vs 3 ctx_shell across campaign children) ([abd89fb](https://github.com/raphaelbahat/pi-workflows/commit/abd89fbf1431671cf787500ecf769bd45fdf92bc))

## [1.7.0](https://github.com/raphaelbahat/pi-workflows/compare/v1.6.0...v1.7.0) (2026-09-13)


### Features

* configurable onUnansweredEscalation (defer | fix) — fix mode grants ONE bounded self-guided fix round per task (implementer resumes with best judgment, fresh verifier re-gates); campaign forwards the policy ([c7db629](https://github.com/raphaelbahat/pi-workflows/commit/c7db629a919a010f7c400e8f155d392436d4c726))

## [1.6.0](https://github.com/raphaelbahat/pi-workflows/compare/v1.5.4...v1.6.0) (2026-09-13)


### Features

* openspec-apply-campaign — serial apply of all unimplemented changes in dependency order, fail-soft, host-handoff digest ([f613c20](https://github.com/raphaelbahat/pi-workflows/commit/f613c206941fe80f1ad0910634dd94c3a64fbbc6))

## [1.5.4](https://github.com/raphaelbahat/pi-workflows/compare/v1.5.3...v1.5.4) (2026-09-13)


### Bug Fixes

* escalation answers-normalization — any bridge status carrying answers is actionable (run [#2](https://github.com/raphaelbahat/pi-workflows/issues/2): 'fix_guidance' with answers was treated as failure); escalate prompt pins bridge status verbatim ([ba9af8b](https://github.com/raphaelbahat/pi-workflows/commit/ba9af8b6653756f0d0726fd17d1e56f899617a0b))
* QA pattern for ALL schema'd classes (status/final/load/escalate → text+parseAgentJson); 3-strike malformed-call cap; restored primer prompt body — kills the StructuredOutput loop class (run [#2](https://github.com/raphaelbahat/pi-workflows/issues/2): 2292-call loop on glm-5.3-flash) ([f95bf4f](https://github.com/raphaelbahat/pi-workflows/commit/f95bf4f30e892e37ac53dacc5689603798d258e5))
* task-scoped test discipline (scoped-first via ctx_shell, full suite once) + grep-anchored verifier reads (whole-file reads only &lt;150 lines) — top post-loop token burners ([2184780](https://github.com/raphaelbahat/pi-workflows/commit/2184780b40a265ab721ab346f136b96245946b26))

## [1.5.3](https://github.com/raphaelbahat/pi-workflows/compare/v1.5.2...v1.5.3) (2026-09-12)


### Bug Fixes

* allow parsed implementer result to resume after escalation ([773ed1f](https://github.com/raphaelbahat/pi-workflows/commit/773ed1f461b4c8730aa78789e8062a1dbc3153fd))
* use lenient text verdicts for apply implementer and verifier agents ([bc1e1b2](https://github.com/raphaelbahat/pi-workflows/commit/bc1e1b282ce230b12237c5c0b752db3b18534bd2))

## [1.5.2](https://github.com/raphaelbahat/pi-workflows/compare/v1.5.1...v1.5.2) (2026-09-11)


### Bug Fixes

* apply-run effort tiers (load medium, primer high) + primer pointer-misfire guard (reject path-like primers — run [#2](https://github.com/raphaelbahat/pi-workflows/issues/2) loop root cause) ([f54eb60](https://github.com/raphaelbahat/pi-workflows/commit/f54eb60ecb7814b2c084b10a8d2ea697c07a1179))

## [1.5.1](https://github.com/raphaelbahat/pi-workflows/compare/v1.5.0...v1.5.1) (2026-09-10)


### Bug Fixes

* context_* sidecar named as explicit fallback in all TOOL ROUTING lines; frontmatter ext: selectors restore ctx_*/ask_user_via_host to sub-agents (production run had ZERO extension tools — tools: all surfaces built-ins only) ([5e40566](https://github.com/raphaelbahat/pi-workflows/commit/5e4056630188cdd7fa74d73d033890acfdb7694f))

## [1.5.0](https://github.com/raphaelbahat/pi-workflows/compare/v1.4.0...v1.5.0) (2026-09-10)


### Features

* propagate model tiers + tool routing to validate-change and campaign (add-pipeline-efficiency applied family-wide) ([b29fbd9](https://github.com/raphaelbahat/pi-workflows/commit/b29fbd959aaaf01e3d3a7a162f5f70bc885b9929))

## [1.4.0](https://github.com/raphaelbahat/pi-workflows/compare/v1.3.0...v1.4.0) (2026-09-10)


### Features

* tool routing to ctx_* compressed tools in apply/plan prompts — transcript diagnosis: 103 plain read/bash calls, 0 ctx_* usage; 3.3M tokens dominated by prompt replay + un-compressed tool outputs ([4c2353d](https://github.com/raphaelbahat/pi-workflows/commit/4c2353d66dabc17af86735ed40638348836f8cc0))

## [1.3.0](https://github.com/raphaelbahat/pi-workflows/compare/v1.2.1...v1.3.0) (2026-09-09)


### Features

* add-pipeline-efficiency — model tiers, context primer, rolling handoffs, true resume; nested decomposition deferred (ADR-0002) ([065f0fe](https://github.com/raphaelbahat/pi-workflows/commit/065f0fe23538485e703416dfb2cfaa3a6f4063e0))
* model tiers + context discipline in plan-change (add-pipeline-efficiency task 2.1) ([65f38a6](https://github.com/raphaelbahat/pi-workflows/commit/65f38a66a22049fbc1638e5d05004ce521541fff))
* pipeline efficiency in apply-change — model tiers, context primer, rolling handoffs, true resume (add-pipeline-efficiency tasks 1.1-1.5) ([75a7473](https://github.com/raphaelbahat/pi-workflows/commit/75a74731a30440112ad3b5990a58bab3abca0327))


### Bug Fixes

* apply Load/re-query map state verbatim + blocked requires non-empty missingArtifacts (minimal-effort Load misread 'ready' as 'blocked') ([d755529](https://github.com/raphaelbahat/pi-workflows/commit/d755529bc02256313502fe4c68807b4c09b8cec7))

## [1.2.1](https://github.com/raphaelbahat/pi-workflows/compare/v1.2.0...v1.2.1) (2026-09-07)


### Bug Fixes

* **ci:** publish npm via release-event + tag gate (paths_released is not JSON for the root package); scope workflow-syntax gate to workflows/, add extension node --check hook ([5ce8727](https://github.com/raphaelbahat/pi-workflows/commit/5ce8727898a3d29b8087418f55ef4418e84f37b4))

## [1.2.0](https://github.com/raphaelbahat/pi-workflows/compare/v1.1.3...v1.2.0) (2026-09-07)


### Features

* add grill-bridge extension — sub-agent ask_user relay over the in-process pi.events bus ([56968be](https://github.com/raphaelbahat/pi-workflows/commit/56968bee1df4a235ef8bce0be8502f81ccfa53f7))
* add openspec-plan-change workflow (mode one|scaffold) and document the openspec family ([8041538](https://github.com/raphaelbahat/pi-workflows/commit/8041538db8c37b8a967b4b885381c519e5b8a400))
* add openspec-validate-change workflow — parallel read-only reviewer sweep + strict CLI gate ([6ce5ef3](https://github.com/raphaelbahat/pi-workflows/commit/6ce5ef3402f31bd98b4ae7916faa733d448e4cbc))
* implement apply-ready mode, openspec-apply-change pipeline, and openspec-campaign orchestrator (step 5) ([f29b1ec](https://github.com/raphaelbahat/pi-workflows/commit/f29b1ec16c141f394c3f8e72399786096236e9c6))
* restructure workflows by family, publish pi-checkpoint-bridge to npm, friendly bridge-absence error in plan-change ([1660809](https://github.com/raphaelbahat/pi-workflows/commit/1660809a00417d7abe3b45271e97d930a0584903))


### Bug Fixes

* apply-ready runaway — author-returned skips settle locally via skipSettled + hard iteration bound (pilot spawned 79 agents before kill) ([86288bc](https://github.com/raphaelbahat/pi-workflows/commit/86288bc29f005b5381465b5abf8b034d77ac6029))
* CLI failures are visible in status snapshots (CLI-ERROR marker) — a machine restart wiped the scratch root and the resolve agent silently fabricated an empty graph ([aea25da](https://github.com/raphaelbahat/pi-workflows/commit/aea25da7ec6667ebc2b3f55b175b2057002f002b))
* collect worktrees only when isolation was requested + record measured step-5 pilots in validation history ([a9ad280](https://github.com/raphaelbahat/pi-workflows/commit/a9ad2807de14809519c6750c1c2c5986fba771f2))
* hoist GRILL above the apply-ready branch — pilot caught a temporal-dead-zone reference ([751f762](https://github.com/raphaelbahat/pi-workflows/commit/751f7626b4e51c5e7389b7db6b86b4c31991f95b))
* pin implementer/verifier file operations to the absolute repo root — relative paths landed task work in the wrong repository (PILOT-NOTE.md false-positive) ([5458f3e](https://github.com/raphaelbahat/pi-workflows/commit/5458f3e576d4d53860212a43422bd5cf6dec300d))
* QA agents are unschemad + gate-based — a schema'd QA child looped forever on successful StructuredOutput calls (104 calls, engine-side non-termination) ([dac64c0](https://github.com/raphaelbahat/pi-workflows/commit/dac64c0e6451dc693647a5c0183c3ad5a25d0066))
* relay ask_user over a process-global bus — pi.events is session-scoped in practice ([4433cfd](https://github.com/raphaelbahat/pi-workflows/commit/4433cfd28d481dc8444952bec93522477e04d1c7))

## [1.1.3](https://github.com/raphaelbahat/pi-workflows/compare/v1.1.2...v1.1.3) (2026-09-03)


### Bug Fixes

* **ci:** actionlint hook from local to remote repo form (CI runners lack actionlint on PATH) ([95e90e7](https://github.com/raphaelbahat/pi-workflows/commit/95e90e70be938bb7e6671cc891d8dfc56a661dad))

## [1.1.2](https://github.com/raphaelbahat/pi-workflows/compare/v1.1.1...v1.1.2) (2026-09-03)


### Bug Fixes

* **ci:** don't trigger CI on release-please PRs (paths-ignore) ([a793625](https://github.com/raphaelbahat/pi-workflows/commit/a793625ac873c4e7bd9547278343414dbbd358d3))

## [1.1.1](https://github.com/raphaelbahat/pi-workflows/compare/v1.1.0...v1.1.1) (2026-09-03)


### Bug Fixes

* **ci:** restore pull-requests scope to release-publish ([a748cb6](https://github.com/raphaelbahat/pi-workflows/commit/a748cb6df309a4546fe8b4bcc266fa84de7cf1fc))

## [1.1.0](https://github.com/raphaelbahat/pi-workflows/compare/v1.0.0...v1.1.0) (2026-09-02)


### Features

* ground syntax gate in upstream pi-subagents meta validation ([27050a2](https://github.com/raphaelbahat/pi-workflows/commit/27050a2c0643592311fcb2907d15c860fc320591))

## [1.0.0](https://github.com/raphaelbahat/pi-workflows/compare/v0.1.0...v1.0.0) (2026-09-02)


### ⚠ BREAKING CHANGES

* adopt prek, CI and release-please ecosystem

### Features

* adopt prek, CI and release-please ecosystem ([b120a5f](https://github.com/raphaelbahat/pi-workflows/commit/b120a5fcbf3dfd6ad495cc2a2761b9e6454c503d))
