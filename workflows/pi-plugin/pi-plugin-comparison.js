export const meta = {
  name: 'pi-plugin-comparison',
  description: 'Cross-plugin comparison: parallel digest agents extract structured data from a directory of evaluation reports, then one composer writes a ranked comparison document — context-safe two-stage synthesis',
  phases: [
    { title: 'Digest', detail: 'shard the reports; extract totals/strengths/weaknesses/families per shard' },
    { title: 'Compose', detail: 'one agent writes the comparison from the compact digest' },
  ],
}

const DIGEST_SCHEMA = {
  type: 'object',
  properties: {
    reports: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          package: { type: 'string' },
          technique: { type: 'string' },
          total: { type: 'number' },
          activity: { type: 'number' },
          fork_delta: { type: 'number' },
          key_strength: { type: 'string' },
          key_weakness: { type: 'string' },
          family: { type: 'string' },
          family_note: { type: 'string' },
        },
        required: ['slug', 'package', 'technique', 'total', 'activity', 'key_strength', 'key_weakness', 'family'],
      },
    },
  },
  required: ['reports'],
}

const DISCOVER_SCHEMA = {
  type: 'object',
  properties: {
    files: { type: 'array', items: { type: 'string' } },
  },
  required: ['files'],
}

// Defensive args parse: the args transport may deliver a JSON-encoded string.
const A = (typeof args === 'string') ? JSON.parse(args) : (args || {})
const DIR = A.reportsDir || 'plugin-reports'
const OUTPUT = A.outputFile || 'COMPARISON.md'
const SHARD = A.shardSize || 9
const FOCUS = A.focus || 'general quality as Pi coding-agent plugins'

let slugs = A.slugs
if (!slugs) {
  log('No args.slugs given — discovery agent lists ' + DIR)
  const disc = await agent(
    'List the directory ' + DIR + ' and return the names of every .md file EXCEPT "' + OUTPUT + '", each WITHOUT the .md extension. ' +
    'Use a single ls command (one tool call per message). If the directory does not exist, return an empty list. ' +
    'Call StructuredOutput exactly once with { files: [ ...names... ] }.',
    { label: 'discover', phase: 'Digest', agentType: 'general-purpose', effort: 'low', schema: DISCOVER_SCHEMA },
  )
  slugs = (disc && disc.files) ? disc.files.filter(Boolean) : []
}
if (!slugs.length) {
  throw new Error('No report files found in ' + DIR + ' — pass args.slugs or point args.reportsDir at a directory of evaluation reports')
}
log('Comparing ' + slugs.length + ' reports from ' + DIR + ' | focus: ' + FOCUS)

function digestPrompt(shard) {
  return [
    'You are extracting structured data from plugin evaluation reports (local Markdown files).',
    'Read EACH of these files exactly once — a single read call per file, full content, never re-read, never read any other file:',
    shard.map(function (s) { return '- ' + DIR + '/' + s + '.md' }).join('\n'),
    '',
    'For EACH file return one record with these fields:',
    '- slug: the filename without .md',
    '- package: from the # title line',
    '- technique: one line from the Metadata or Functionality section',
    '- total: the number from the Evaluation Table **Total** row',
    '- activity: the number from the Activity & Maintenance row of the table',
    '- fork_delta: the number from the Fork Delta row, or -1 if it says n/a (standalone) or the section is absent',
    '- key_strength: the single strongest advantage from Advantages / Pros, compressed to at most 15 words',
    '- key_weakness: the single most damaging disadvantage or limitation, compressed to at most 15 words',
    '- family: a short lowercase token identifying the plugin family this report belongs to — derive it from the report Fork / Variant Analysis, shared naming, or sibling references (e.g. "dcp", "vcc", "headroom"); use "standalone" when no family is indicated',
    '- family_note: one line on fork/original/re-publish status if the report has a Fork / Variant Analysis section, otherwise an empty string',
    '',
    'TOOL DISCIPLINE: issue at most ONE tool call per message; never batch tool calls. If a call is rejected as malformed, silently re-issue that one call cleanly.',
    'When all files are read, call StructuredOutput exactly once with { reports: [ one record per file, same order as listed ] }. Do not answer in prose instead.',
  ].join('\n')
}

function composePrompt(records) {
  return [
    'You are the final synthesizer for a ' + records.length + '-plugin evaluation sweep of Pi coding-agent plugins.',
    'Evaluation focus of the sweep: ' + FOCUS,
    'Below is a validated digest of all reports, extracted from the report files in ' + DIR + ' — those files are the source of truth and this digest is complete and authoritative.',
    '',
    'DIGEST JSON:',
    JSON.stringify(records),
    '',
    'Write ' + DIR + '/' + OUTPUT + ' (OVERWRITE the existing file if present) with sections in this order — atomic bullets and Markdown tables only, no prose walls:',
    '## Master Ranking — table of ALL ' + records.length + ' plugins sorted by total descending: | Rank | Package | Technique | Total | Key strength | Key weakness | Activity |',
    '## Families, Forks & Re-publishes — group the plugins by their family field; for each family: members, true original vs forks vs re-publishes (use family_note), which member wins and why. Also note notable standalone plugins.',
    '## Tiers & Recommendations — best per use case implied by the techniques (e.g. hands-off automation; manual control; lowest-risk footprint; most clever technique); include a short ones-to-avoid list with reasons.',
    '## Method Notes — one line on the rubric: scope creep deducted, setup complexity never deducted, every provided URL required per report. Sweep focus: ' + FOCUS,
    '## Report QA — the digest should contain ' + records.length + ' records; list any missing slugs or missing/odd totals.',
    '',
    'TOOL DISCIPLINE: one tool call per message. Write the complete document with a single write call, then call no further tools.',
    'Return a text summary under 250 words: records ranked, top 5 by total, families detected, QA issues.',
  ].join('\n')
}

const shards = []
for (let i = 0; i < slugs.length; i += SHARD) {
  shards.push(slugs.slice(i, i + SHARD))
}
log('Digesting ' + slugs.length + ' reports in ' + shards.length + ' shards of <= ' + SHARD)

const digestResults = await pipeline(
  shards,
  function (shard) {
    return agent(digestPrompt(shard), { label: 'digest:' + shard[0], phase: 'Digest', agentType: 'general-purpose', effort: 'medium', schema: DIGEST_SCHEMA })
  },
)

const records = []
const shardsOk = []
const shardsFailed = []
for (let i = 0; i < shards.length; i++) {
  if (digestResults[i] && digestResults[i].reports && digestResults[i].reports.length) {
    shardsOk.push(shards[i][0])
    for (let j = 0; j < digestResults[i].reports.length; j++) records.push(digestResults[i].reports[j])
  } else {
    shardsFailed.push(shards[i][0])
  }
}
log('Digest done: ' + records.length + ' records from ' + shardsOk.length + '/' + shards.length + ' shards' + (shardsFailed.length ? ' (failed shards start at: ' + shardsFailed.join(', ') + ')' : ''))

phase('Compose')
const synthesis = await agent(composePrompt(records), { label: 'compose', phase: 'Compose', agentType: 'general-purpose', effort: 'high' })

return {
  files: slugs.length,
  records: records.length,
  shards_failed: shardsFailed,
  output_path: DIR + '/' + OUTPUT,
  synthesis: synthesis,
}
