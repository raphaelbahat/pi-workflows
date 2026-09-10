# Changelog

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
