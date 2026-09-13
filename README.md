# pi-workflows

A family of reusable, args-driven [pi-subagents](https://github.com/tintinweb/pi-subagents)
workflows in two groups:

- **OpenSpec workflows** — author, implement, validate, and campaign OpenSpec changes with
  per-task implement/verify separation, a checkpoint-bridge user-interaction channel, runtime
  cost disciplines, and cross-provider model fallback.
- **Pi Plugin workflows** — evaluate, compare, and stack-rank Pi coding-agent plugins from
  their documentation URLs.

> [!TIP]
> Looking for deep documentation? Hop on to [Further Reading](#further-reading) or dig in [`/docs`](docs).

## Quick Setup

### Prerequisites

- The [Pi coding agent](https://github.com/earendil-works/pi).
- The [Pi-subagents](https://github.com/tintinweb/pi-subagents) extension.
- **OPTIONAL**, _required if using the OpenSpec workflows_: The [checkpoint-bridge](https://www.npmjs.com/package/pi-checkpoint-bridge) extension.
- **OPTIONAL**: [Skillshare](https://github.com/runkids/skillshare) for the recommended distribution [and workflows update path](#tracked).

### Installation

Two paths:

- **Tracked**: The _recommend path_; distribution and one-command updates via Skillshare.
- **Untracked**: _Not recommended_; distribution and updates via Git clone.

#### Tracked

```bash
skillshare install raphaelbahat/pi-workflows --track   # preserves .git for updates

# Later updates: git pulls via skillshare
# skillshare update agents --all   # agents-scoped (the bare name may hit the skills source)
```

#### Untracked

```bash
git clone https://github.com/raphaelbahat/pi-workflows ~/pi-workflows

# Later updates: git pull in the clone
# cd ~/pi-workflows && git pull
```

### Distribution

Register your project as a distribution target (both extras, same target) and point the extras'
**source** at your installation's `workflows/` directories.

#### Tracked

A tracked install clones the repo into the Skillshare **agents** source as `_pi-workflows/`
(the repo has no `SKILL.md`, so Skillshare classifies it as an agents repo):

    ~/.config/skillshare/agents/_pi-workflows/

Fresh setup; register the tracked clone as the extras source:

```bash
skillshare extras init pi-workflows-openspec --source ~/.config/skillshare/agents/_pi-workflows/workflows/openspec --target /path/to/project/.pi/workflows --mode copy -g --no-tui
skillshare extras init pi-workflows-plugins --source ~/.config/skillshare/agents/_pi-workflows/workflows/pi-plugin --target /path/to/project/.pi/workflows --mode copy -g --no-tui
skillshare sync extras -g --force
```

> [!NOTE]
> Already have the extras (e.g. previously pointed at a git clone)? Edit their `source:` fields
> in `~/.config/skillshare/config.yaml` to the tracked paths above — `extras init --force` resets
> the target list — then re-run `skillshare sync extras -g --force`.

#### Untracked

With the git clone at `~/pi-workflows`, register the clone as the extras source:

```bash
skillshare extras init pi-workflows-openspec --source ~/pi-workflows/workflows/openspec --target /path/to/project/.pi/workflows --mode copy -g --no-tui
skillshare extras init pi-workflows-plugins --source ~/pi-workflows/workflows/pi-plugin --target /path/to/project/.pi/workflows --mode copy -g --no-tui
skillshare sync extras -g --force
```

Already have the extras with this source? Just add targets:

```bash
skillshare extras pi-workflows-openspec --add-target /path/to/project/.pi/workflows -g
skillshare extras pi-workflows-plugins --add-target /path/to/project/.pi/workflows -g
skillshare sync extras -g --force
```

### Update

#### Tracked

```bash
# Tracked: one-command updates via Skillshare (the tracked clone lives under the agents
# source: ~/.config/skillshare/agents/_pi-workflows — the bare name may hit the skills source)
skillshare update agents --all
```

#### Untracked

```bash
# Untracked: manual updates via git
cd ~/pi-workflows && git pull
```

> [!TIP]
> Verify: from the project, ask the model to run a workflow by name, or invoke by path (below).

> [!NOTE]
> Along with `.pi/workflows/`, both `.agents/workflows/` and `<agent dir>/workflows/` are also valid distribution targets — any directory the `pi-subagents` resolver scans works; pick the one your setup already uses.

For further distribution documentation, copy-vs-symlink gotchas, and target retirement, refer to [Development and Maintenance](docs/development-and-maintenance.md).

### Interactive

**Run by name from inside Pi**.

Inside a project with `.pi/workflows/` populated by the skillshare extras, just ask the model:
_"run the pi-plugin-eval workflow with args {…}"_. The resolver matches the saved workflow by name.

### Headless

Invoke via CLI by path from anywhere, including headless runs:

```bash
pi -p --subagents-workflow-file="$HOME/pi-workflows/workflows/pi-plugin/pi-plugin-eval.js"   # use the = form
```

Arguments may be passed via the `args` argument — as a JSON object or a JSON-encoded string (both handled). Each workflow's args contract is documented in its group doc under [Workflows](#workflows).

## Workflows

| Workflow                                                                   | Purpose                                                                                                                                                                                   |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [openspec-validate-change](workflows/openspec/openspec-validate-change.js) | Read-only validation sweep: 4 parallel reviewer dimensions + strict CLI gate → CRITICAL/WARNING/SUGGESTION scorecard                                                                      |
| [openspec-plan-change](workflows/openspec/openspec-plan-change.js)         | Schema-driven authoring for one change; modes `scaffold`\|`one`\|`apply-ready`; grill via the checkpoint bridge; never applies/archives                                                   |
| [openspec-apply-change](workflows/openspec/openspec-apply-change.js)       | Per-task implementation: implementer + separate checkbox-verifier per task, one batched bridge escalation on the first blocker, configurable unanswered-escalation policy; never archives |
| [openspec-campaign](workflows/openspec/openspec-campaign.js)               | Campaign orchestrator for N independent changes: serial scaffolding + one-level plan fan-out + `CAMPAIGN.md` digest                                                                       |
| [openspec-apply-campaign](workflows/openspec/openspec-apply-campaign.js)   | Serial apply of ALL unimplemented changes in dependency order; fail-soft per change; host-handoff digest; no commits/archive                                                              |
| [pi-plugin-eval](workflows/pi-plugin/pi-plugin-eval.js)                    | One research agent per plugin reads ALL provided URLs → structured report; QA-verifier gated; idempotent re-runs                                                                          |
| [pi-plugin-comparison](workflows/pi-plugin/pi-plugin-comparison.js)        | Two-stage synthesis: parallel digest shards → ranked comparison                                                                                                                           |
| [pi-plugin-stack-advisor](workflows/pi-plugin/pi-plugin-stack-advisor.js)  | 4 persona-lensed advisors + unbiased → complementary non-conflicting stack recommendations                                                                                                |
| [pi-plugin-pipeline](workflows/pi-plugin/pi-plugin-pipeline.js)            | Orchestrator: eval → comparison → (optional) stack recommendations                                                                                                                        |

## Development and Debugging

- **Syntax gate**: `node scripts/check-workflow-syntax.mjs` — `node --check` on every workflow
  script; wired into prek and GitHub Actions; must pass before every push.
- **Transcript diagnostics**: `node scripts/analyze-subagent-transcripts.mjs [sessionsDir]
[--days N] [--top N]` — aggregate tool distribution, per-session token totals (replay-inclusive),
  context hogs (largest tool results), loop signatures (identical tool+args ≥5×), and ctx_*
  adoption. Live use identified the 2,292-call `StructuredOutput` production loop.
- Workflow scripts must keep the `export const meta = { name, description }` declaration (the
  resolver's marker), a pure-literal `meta`, and no `Date.now`/`Math.random` (determinism for
  resume).
- Commits are GPG-signed; if the passphrase cache expires mid-work, stage the work and re-run
  the unlock ritual (`echo test | gpg --batch --clearsign /dev/null`).

Full development/maintenance documentation — distribution mechanics, scripts reference,
operational notes, and known pi-subagents quirks — lives in
[docs/development-and-maintenance.md](docs/development-and-maintenance.md).

## Further Reading

- **[Workflows — OpenSpec group](docs/workflows/openspec-workflows.md)** — args contracts for
  the five OpenSpec workflows, runtime disciplines (the shared TOOL block), context primer and
  handoffs, escalation policy, model tiers + cross-provider fallback.
- **[Workflows — Pi Plugin group](docs/workflows/pi-plugin-workflows.md)** — args contracts and
  flow for the four pi-plugin workflows.
- **[Development and Maintenance](docs/development-and-maintenance.md)** — skillshare
  distribution mechanics (copy mode!), the CI gate, scripts reference, GPG/release operations,
  and known pi-subagents quirks. References the [OpenSpec Index](docs/openspec-index.md).
- **[OpenSpec Index](docs/openspec-index.md)** — ADRs, capability specs, and the
  archived/active change inventory, with the archive policy.
