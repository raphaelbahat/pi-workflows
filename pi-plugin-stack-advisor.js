export const meta = {
  name: 'pi-plugin-stack-advisor',
  description: 'Five advisor agents read a comparison document and propose complementary, non-conflicting plugin stacks (4 persona-lensed, 1 unbiased); a synthesizer merges them into a recommendations document',
  phases: [
    { title: 'Advisors', detail: 'parallel stack advisors, each with its own prioritization lens' },
    { title: 'Synthesize', detail: 'merge the advisor stacks into the recommendations document' },
  ],
}

const STACK_SCHEMA = {
  type: 'object',
  properties: {
    persona: { type: 'string' },
    stack: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          package: { type: 'string' },
          role: { type: 'string' },
          why: { type: 'string' },
          conflict_check: { type: 'string' },
        },
        required: ['slug', 'package', 'role', 'why', 'conflict_check'],
      },
    },
    avoided: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['persona', 'stack', 'summary'],
}

// Defensive args parse: the args transport may deliver a JSON-encoded string.
const A = (typeof args === 'string') ? JSON.parse(args) : (args || {})
const COMPARISON = A.comparisonFile || 'plugin-reports/COMPARISON.md'
const REPORTS = A.reportsDir || ''
const OUTPUT = A.outputFile || 'STACK-RECOMMENDATIONS.md'

const DEFAULT_PERSONAS = [
  { id: 'hands-off', lens: 'FULLY AUTONOMOUS / HANDS-OFF operation: the user wants zero-touch plugins that run automatically with sensible defaults; manual commands or mandatory external services are heavily penalized.' },
  { id: 'cost', lens: 'COST & TOKEN EFFICIENCY: minimize LLM token spend, latency, and the number of extra model calls the stack adds per task.' },
  { id: 'clever', lens: 'MOST CLEVER TECHNIQUE: the user wants the technically most ingenious, novel, or effective approaches, even if younger or less battle-tested.' },
  { id: 'minimal-risk', lens: 'LOWEST-RISK MINIMAL FOOTPRINT: the user wants the safest, smallest, most reversible setup — lossless or fail-closed designs, active maintenance, minimal moving parts.' },
  { id: 'unbiased', lens: 'NONE — you carry NO user prioritization or bias. Judge purely on complementarity and non-conflict for a general user, choosing whichever plugins combine best regardless of style.' },
]

const personas = (A.personas && A.personas.length) ? A.personas : DEFAULT_PERSONAS
log('Consulting ' + personas.length + ' advisors on ' + COMPARISON)

function advisorPrompt(p) {
  return [
    'You are advising a Pi coding-agent user on assembling a COHERENT STACK of plugins.',
    'Pi context: plugins are npm packages loaded via `pi install npm:<pkg>`; several may REPLACE a built-in mechanism (only one such plugin can own it), while others offload, prune, or add retrieval — those can complement an owner.',
    '',
    'SOURCE OF TRUTH: read ' + COMPARISON + ' fully (once). For any plugin you consider recommending, verify its compatibility claims by reading its individual report under ' + (REPORTS ? REPORTS : 'the same directory as the comparison document') + '/<slug>.md (slug = filename; check the ranking rows and Report QA for slug-level names).',
    '',
    'PERSONA (your ONLY prioritization lens — everything else is irrelevant to you): ' + p.lens,
    '',
    'TASK: recommend a stack of 2-5 plugins that:',
    '- COMPLEMENT each other: each covers a different aspect so the benefits compound instead of overlapping.',
    '- DO NOT CONFLICT: verify functional compatibility. Plugins that both replace the same built-in mechanism, or both rewrite the same state, cannot coexist; also check for double-processing of the same data and incompatible external dependencies. Cite which report section informed each conflict check.',
    '',
    'Also list notable plugins you EXCLUDED for conflict or redundancy reasons, each with a one-line reason.',
    '',
    'TOOL DISCIPLINE: at most ONE tool call per message; never batch. If a call is rejected as malformed, silently re-issue that one call cleanly. Call StructuredOutput exactly once at the end: persona, stack (2-5 items with slug, package, role, why, conflict_check), avoided (exclusions with reasons), summary (<= 80 words).',
  ].join('\n')
}

function synthPrompt(stacks) {
  return [
    'Five advisor agents proposed persona-specific plugin stacks for Pi coding-agent context optimization. Their structured outputs follow.',
    '',
    'STACKS JSON:',
    JSON.stringify(stacks),
    '',
    'You may read ' + COMPARISON + ' once for grounding if needed.',
    '',
    'Write ' + OUTPUT + ' (new file or overwrite) with sections in this order — atomic bullets and Markdown tables only, no prose walls:',
    '## Overview — method in 3 bullets: the advisors (persona-lensed plus one unbiased), complementarity criterion, conflict criterion.',
    '## Persona Stacks — one subsection per advisor: a table | Package | Role in stack | Why it fits the persona | Conflict check |, plus their notable exclusions as bullets.',
    '## Cross-Persona Consensus — plugins appearing in multiple stacks (with counts); conflicts every advisor avoided.',
    '## Conflict Matrix — a table of plugin pairs that CANNOT be combined (both sides, one-line reason each) and, separately, pairs explicitly verified as complementary.',
    '## Recommended Default Stack — the single best-balanced stack for a general user with a short rationale, plus a one-line variant note per persona.',
    '',
    'TOOL DISCIPLINE: at most ONE tool call per message. Write the complete document with a single write call, then call no further tools.',
    'Return a text summary under 250 words: the consensus plugins, the default stack, and the most important conflict rule discovered.',
  ].join('\n')
}

const stacks = await parallel(
  personas.map(function (p) {
    return function () {
      return agent(advisorPrompt(p), { label: 'advisor:' + p.id, phase: 'Advisors', agentType: 'general-purpose', effort: 'high', schema: STACK_SCHEMA })
    }
  }),
)

const okStacks = []
const failed = []
for (let i = 0; i < personas.length; i++) {
  if (stacks[i]) { okStacks.push(stacks[i]) } else { failed.push(personas[i].id) }
}
log('Advisors done: ' + okStacks.length + '/' + personas.length + ' stacks' + (failed.length ? ' (failed: ' + failed.join(', ') + ')' : ''))

phase('Synthesize')
const synthesis = await agent(synthPrompt(okStacks), { label: 'synthesize-stacks', phase: 'Synthesize', agentType: 'general-purpose', effort: 'high' })

return {
  advisors_ok: okStacks.map(function (s) { return s.persona }),
  advisors_failed: failed,
  output_path: OUTPUT,
  synthesis: synthesis,
}
