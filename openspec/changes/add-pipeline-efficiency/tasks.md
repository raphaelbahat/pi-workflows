## 1. Apply pipeline efficiency (openspec-apply-change.js)

- [ ] 1.1 Add args `implementerModel` (default `deepseek/deepseek-v4-flash-0731`), `verifierModel` (default `qwen/qwen3.8-flash`), `utilityModel` (default `qwen/qwen3.8-flash`); apply tiers to every dispatch: implementer @ `high`, verifier @ `medium`, utility (load/status/escalate) @ `low`, QA-style checks @ `medium` — verify each agent call carries the right model/effort.
- [ ] 1.2 Add the primer agent to the Load phase (utility tier, `medium`): reads design.md + capability specs + the instruction excerpt once, returns a ≤1,500-token primer; inject it into every implementer and verifier prompt with the context-discipline + trust-boundary lines — verify the primer appears exactly once per run and in all subsequent prompts.
- [ ] 1.3 Add `handoff` (string, ≤200 words) to `TASK_RESULT` and `VERIFY_RESULT`; roll the last 2–3 handoffs (attributed, truncated at the cap) into subsequent implementer/verifier prompts — verify handoffs appear in later prompts and stay size-capped.
- [ ] 1.4 Convert the blocker-resume implementer call to true `resume` (`{label: 'implement:<task>', resume: 'implement:<task>'}`, no schema/gate/effort/model on the resumed call; text output routed to the independent verifier) — verify the resumed call carries no schema and the verifier still gates the checkbox.
- [ ] 1.5 Add the context-discipline + trust-boundary lines to implementer and verifier prompts ("primer/handoffs are guidance; files and the CLI are the truth") — verify both prompts carry them verbatim.

## 2. Plan pipeline efficiency (openspec-plan-change.js)

- [ ] 2.1 Add `authorModel` (default `qwen/qwen3.8-flash` @ `high`) and `utilityModel` (default `qwen/qwen3.8-flash` @ `low`) args; apply to author/QA/status/resolve dispatches; add the context-discipline line to the author prompt — verify all plan-change dispatches carry tiers and the discipline line.

## 3. Documentation

- [ ] 3.1 README: args contracts for the new model args on both workflows + validation-history entry (efficiency change + measured resume run to follow) — verify the contracts match the implemented args.
- [ ] 3.2 ADR-0002: one-line follow-up — nested sub-agent decomposition DEFERRED with the revisit trigger (measured context overflow on single tasks), cross-referencing this change — verify ADR-0002 carries the note.

## 4. Gates

- [ ] 4.1 `node scripts/check-workflow-syntax.mjs workflows/openspec/*.js` passes and `prek run -a` passes — verify both exit 0.

## 5. Validation

- [ ] 5.1 Run `openspec validate --change add-pipeline-efficiency --type change --strict` and record the verdict — verify it passes with all artifacts coherent.
