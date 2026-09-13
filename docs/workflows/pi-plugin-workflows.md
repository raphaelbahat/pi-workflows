# Workflows — Pi Plugin group

Evaluation, comparison, and stack-advisory workflows for Pi coding-agent plugins.
See [Development and Maintenance](../development-and-maintenance.md) for distribution and
scripts; the [OpenSpec group](openspec-workflows.md) covers the authoring/implementation family.

## pi-plugin-eval

One high-effort research agent per plugin reads ALL provided URLs and writes a structured
report; a per-report QA verifier gates on report existence; skip-if-report-exists makes
re-runs idempotent.

- `plugins` **(required)** — array of `{slug?, package, urls[], notes?}` records, bare npm
  package names (`"pi-safe-compact"`), or URLs (npm/GitHub/pi.dev — parsed automatically)
- `outDir` — report output directory (default `plugin-reports`)
- `focus` — evaluation lens (default: general quality as a Pi coding-agent plugin)

## pi-plugin-comparison

Context-safe two-stage synthesis: parallel digest agents (shards) extract totals/strengths/
weaknesses/families from the evaluation reports; one composer writes the ranked comparison.

- `reportsDir` — directory of evaluation reports (default `plugin-reports`)
- `slugs` — optional array of report filenames without `.md`; omitted → a discovery agent
  lists the directory
- `outputFile` — default `COMPARISON.md`
- `shardSize` — reports per digest agent (default 9)
- `focus` — sweep focus carried into Method Notes

## pi-plugin-stack-advisor

4 persona-lensed advisors (hands-off, cost, clever, minimal-risk, unbiased) propose
complementary, non-conflicting plugin stacks; a synthesizer merges them.

- `comparisonFile` — the comparison document to read (default `plugin-reports/COMPARISON.md`)
- `reportsDir` — optional, for per-plugin report verification by advisors
- `outputFile` — default `STACK-RECOMMENDATIONS.md`
- `personas` — optional `[{id, lens}]` override

## pi-plugin-pipeline

Orchestrator: eval → comparison → (optional) stack recommendations.

- `plugins`, `outDir`, `focus` — as eval
- `comparisonFile`, `stackOutputFile` — output names
- `stack` — set truthy to also run the stack advisor