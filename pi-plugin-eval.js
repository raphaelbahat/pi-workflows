export const meta = {
  name: 'pi-plugin-eval',
  description: 'Evaluate a list of Pi plugins: one high-effort research agent per plugin reads ALL provided URLs and writes a structured report; per-report QA verifier; args-driven and topic-agnostic',
  phases: [
    { title: 'Evaluate', detail: 'one research agent per plugin; reads every provided URL; writes the report' },
    { title: 'Verify', detail: 'QA each report: sections, FULL URL coverage, fork analysis; fix gaps' },
  ],
}

const KETCH_HINT = 'If a ketch skill file exists in this session (check /tmp/outfitter-coding-pi-*/skills/ketch/SKILL.md via a single ls), skim it first; regardless, use the ketch MCP tools per the rules below.'

const EVAL_SCHEMA = {
  type: 'object',
  properties: {
    slug: { type: 'string' },
    package: { type: 'string' },
    report_path: { type: 'string' },
    technique: { type: 'string' },
    scores: {
      type: 'object',
      properties: {
        functionality: { type: 'number' },
        features: { type: 'number' },
        advantages: { type: 'number' },
        disadvantages: { type: 'number' },
        limitations: { type: 'number' },
        activity: { type: 'number' },
        scope_creep: { type: 'number' },
        cleverness: { type: 'number' },
        automation: { type: 'number' },
        fork_delta: { type: 'number' },
      },
      required: ['functionality', 'features', 'advantages', 'disadvantages', 'limitations', 'activity', 'scope_creep', 'cleverness', 'automation'],
    },
    total: { type: 'number' },
    one_line_verdict: { type: 'string' },
    sources_read: { type: 'array', items: { type: 'string' } },
  },
  required: ['slug', 'package', 'report_path', 'technique', 'scores', 'total', 'one_line_verdict'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    slug: { type: 'string' },
    report_exists: { type: 'boolean' },
    criteria_complete: { type: 'boolean' },
    urls_covered: { type: 'boolean' },
    fork_analysis: { type: 'string' },
    fixes_made: { type: 'array', items: { type: 'string' } },
    total: { type: 'number' },
    technique: { type: 'string' },
    final_ok: { type: 'boolean' },
  },
  required: ['slug', 'report_exists', 'criteria_complete', 'urls_covered', 'fork_analysis', 'final_ok'],
}

const RUBRIC = [
  'SCORING RUBRIC (use for the report table and your structured return):',
  '- Every criterion scored 0-10 (0.5 steps allowed). Total = round(mean of scored criteria x 10, 1). fork_delta is excluded from the mean when it is the -1 (standalone) sentinel.',
  '- functionality / features / advantages: 10 = excellent.',
  '- disadvantages and limitations: 10 = none or negligible; 0 = severe and unavoidable.',
  '- activity: 9-10 commits or publish within about 1 month; 7-8 within about 3 months; 5-6 within 12 months; 2-4 stale beyond 1 year or a single release; 0-1 abandoned, archived, or unverifiable.',
  '- scope_creep: starts at 10; DEDUCT for every capability unrelated to the evaluation focus and for needless over-engineering (overkill). 6-7 = noticeable creep; 5 or below = major overkill. Setup complexity is NEVER a deduction.',
  '- cleverness: 0 = trivial wrapper around built-ins; 5 = standard technique done well; 8-10 = genuinely novel or notably effective strategy.',
  '- automation (hands-off): 10 = zero-touch always-on; 7-9 = automatic with minor config; 4-6 = half manual; 0-3 = fully manual.',
  '- fork_delta: -1 when standalone; otherwise 0-10 for unique value versus the original (0 = pure re-publish, 10 = major independent improvement).',
  '- Be honest and critical: thin wrappers, dead repos, and buzzword-only plugins must score low.',
].join('\n')

const TEMPLATE = [
  'REPORT FILE FORMAT (write with the write tool; atomic bullets only; no long paragraphs; do not bury information):',
  '# <package> — Evaluation Report',
  '## Metadata (publisher, repo, npm, pi.dev page, license, latest version and date, technique category)',
  '## Functionality',
  '## Features',
  '## Advantages / Pros',
  '## Disadvantages / Cons',
  '## Limitations',
  '## Activity & Maintenance',
  '## Scope Creep',
  '## Cleverness of Technical Approach',
  '## Hands-off Automation',
  '## Fork / Variant Analysis (omit this heading entirely when standalone)',
  '## Sources Consulted (one bullet per URL: the takeaway from it, or FAILED with the error)',
  '## Evaluation Table — Markdown table at the very bottom:',
  '| Criterion | Key findings (bullets) | Score (0-10) |',
  'one row per criterion: Functionality, Features, Advantages, Disadvantages, Limitations, Activity & Maintenance, Scope Creep, Cleverness, Hands-off Automation, Fork Delta (or n/a (standalone)), then a final row:',
  '| **Total** | mean of scored criteria x 10 | **<total>** |',
].join('\n')

// Defensive args parse: the args transport may deliver a JSON-encoded string.
const A = (typeof args === 'string') ? JSON.parse(args) : (args || {})
const FOCUS = A.focus || 'general quality and fitness as a Pi coding-agent plugin'
const OUT = A.outDir || 'plugin-reports'

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function normalize(entry) {
  if (typeof entry === 'string') {
    if (/^https?:/i.test(entry)) {
      let m = entry.match(/npmjs\.com\/package\/([^/?#]+)/i)
      if (m) return { package: decodeURIComponent(m[1]), urls: [entry] }
      m = entry.match(/pi\.dev\/packages\/([^/?#]+)/i)
      if (m) return { package: m[1], urls: [entry] }
      m = entry.match(/github\.com\/([^/]+)\/([^/?#]+)(?:\/tree\/[^?#]+)?/i)
      if (m) return { package: m[2], urls: [entry] }
      return { package: entry, urls: [entry] }
    }
    return { package: entry, urls: ['https://www.npmjs.com/package/' + entry, 'https://pi.dev/packages/' + entry] }
  }
  return { package: entry.package, urls: entry.urls || [], notes: entry.notes }
}

const plugins = (A.plugins || []).map(normalize).map(function (p) {
  return { slug: p.slug || slugify(p.package), package: p.package, urls: p.urls || [], notes: p.notes || '' }
})
const seen = {}
for (const p of plugins) {
  if (seen[p.slug]) { seen[p.slug] += 1; p.slug = p.slug + '-' + seen[p.slug] } else { seen[p.slug] = 1 }
}
if (!plugins.length) {
  throw new Error('args.plugins is required — pass an array of {slug?, package, urls[], notes?} records, bare package names, or URLs')
}
log('Evaluating ' + plugins.length + ' plugins | focus: ' + FOCUS + ' | outDir: ' + OUT)

function sourceBlock(p) {
  return p.urls.map(function (u) { return '- ' + u }).join('\n')
}

function evalPrompt(p) {
  return [
    'You are evaluating ONE plugin for the Pi coding agent.',
    'EVALUATION FOCUS (the lens for this sweep): ' + FOCUS,
    'Pi context: plugins are npm packages loaded via `pi install npm:<pkg>` or `-e <path>`; they hook session events (tool calls, compaction, prompts) and may add commands.',
    '',
    'TOOL DISCIPLINE (critical — malformed tool calls have killed earlier attempts):',
    '- Issue AT MOST ONE tool call per message. Never batch two or more tool calls in a single turn. After each result, issue the next single call.',
    '- If a tool call is rejected as malformed, silently re-issue that ONE call cleanly. Never restate, quote, or paraphrase tool-call markup as text.',
    '- When research is complete, call StructuredOutput exactly once with the required object. Do not answer in prose instead.',
    '',
    'PLUGIN UNDER REVIEW: ' + p.package,
    'REPORT FILE — write exactly this one file and nothing else: ' + OUT + '/' + p.slug + '.md',
    '',
    'PRIMARY SOURCES — MANDATORY, read EVERY one of these:',
    sourceBlock(p),
    'URL COVERAGE RULE (hard requirement): you MUST attempt and read EVERY URL listed above. Record each URL under Sources Consulted with a one-line takeaway of what it contributed. If a URL fails or 404s, record it as FAILED with the error — that still counts as covered. Silently skipping any listed URL is non-compliance.',
    '',
    p.notes ? 'RELATIONSHIP NOTES: ' + p.notes : 'RELATIONSHIP NOTES: none known — if you discover a fork or variant relationship during research, analyze it under Fork / Variant Analysis.',
    '',
    'METHOD:',
    '1. ' + KETCH_HINT + ' Use ketch MCP tools for all page fetching: ketch_scrape with max_chars 15000-40000 and trim:true on unknown pages (never unbounded), ketch_search when a URL 404s, ketch_crawl (max_pages <= 10) only for real documentation sites.',
    '2. Maintenance evidence via ctx_shell: `gh api repos/<owner>/<repo>` and `gh api repos/<owner>/<repo>/commits?per_page=5` (fallback `curl -s https://api.github.com/...`; on 403 rate limit, ketch_scrape the repository HTML page instead). Extract: pushed_at, created_at, stargazers_count, open_issues_count, archived, fork/parent. For npm: `curl -s https://registry.npmjs.org/<pkg>` piped through jq or node to extract time.created, time.modified, dist-tags.latest, and the number of published versions.',
    '3. Read the full README. Follow linked docs, sites, and papers that inform the evaluation. If the README is thin or the claims are vague, skim the source entry point to verify the plugin actually implements what it claims.',
    '4. If ketch tools fail repeatedly, switch to the agent-browser MCP tools (read that skill file first if present in this session). Last resort: `curl -sL` via ctx_shell.',
    '5. Do NOT modify any other file. Do not run builds or tests. Research plus one report only.',
    '',
    'EVALUATE (atomic bullets; no prose paragraphs; no buried information):',
    '- Functionality: the actual mechanism; how it integrates with pi (hooks, events, commands, tool wrapping); whether it delivers what it claims.',
    '- Features: concrete enumeration.',
    '- Advantages / Pros: versus built-in behavior and versus running no plugin.',
    '- Disadvantages / Cons: risks and fragility, conflicts with other plugins, overhead.',
    '- Limitations: hard constraints, manual steps, model restrictions, open issues.',
    '- Activity & Maintenance: dates, stars, issues, commit cadence, release history, bus factor.',
    '- Scope Creep: anything beyond the evaluation focus (unrelated capabilities, feature sprawl, product upsells). Overkill deducts points.',
    '- Cleverness of Technical Approach: name the exact technique and rate its ingenuity and effectiveness.',
    '- Hands-off Automation: zero-touch versus manual commands; sensible defaults versus required tuning.',
    '- Fork / Variant Analysis: ONLY if this is a fork or variant — identical parts, unique implementation and functionality, maintenance delta, verdict versus the original.',
    '',
    RUBRIC,
    '',
    TEMPLATE,
    '',
    'If the report file already exists AND contains an Evaluation Table with a Total: read it, verify URL coverage (fetch any missing expected URL yourself), patch gaps, and return the summary without redoing full research.',
    'If all sources are dead, still write the report: document the failures, score activity very low, list every URL as FAILED under Sources Consulted.',
    'Finish by returning the structured output: slug ' + p.slug + ', package ' + p.package + ', report_path, technique (one line), scores, total, one_line_verdict, sources_read (every URL you actually read).',
  ].join('\n')
}

function verifyPrompt(p) {
  return [
    'QA pass for one plugin evaluation report.',
    'PLUGIN: ' + p.package,
    'REPORT FILE: ' + OUT + '/' + p.slug + '.md',
    'EXPECTED SOURCES — ALL of these must appear under Sources Consulted in the report:',
    sourceBlock(p),
    '',
    p.notes ? 'RELATIONSHIP NOTES: ' + p.notes : '',
    '',
    'Steps:',
    '1. If the report file does NOT exist: research the plugin yourself and write it. Follow the ketch-first method (ketch MCP tools, bounded max_chars), attempt EVERY expected URL, and use this rubric and format:',
    RUBRIC,
    TEMPLATE,
    '2. If it exists, read it fully and check:',
    '   a. All required sections present: Metadata, Functionality, Features, Advantages / Pros, Disadvantages / Cons, Limitations, Activity & Maintenance, Scope Creep, Cleverness of Technical Approach, Hands-off Automation, Sources Consulted, Evaluation Table.',
    '   b. Atomic-bullet style throughout; no prose walls.',
    '   c. Evaluation Table has one row per criterion with 0-10 scores, a Fork Delta row (or n/a for standalone), and a Total row.',
    '   d. FULL URL COVERAGE: every expected source URL is listed under Sources Consulted with a takeaway or an explicit FAILED note. Fetch any missing URL yourself via ketch tools (ONE tool call per message) and add its findings to the relevant sections.',
    '   e. If this is a fork or variant (see relationship notes): a Fork / Variant Analysis section exists comparing to the original, including unique implementation details.',
    '3. Fix deficiencies by EDITING the report. Do not rewrite healthy content. Keep atomic-bullet style.',
    'Return structured output: slug, report_exists, criteria_complete, urls_covered, fork_analysis (ok | n/a | missing), fixes_made (list), total (the Total score from the report, or -1 if absent), technique (one line), final_ok.',
  ].filter(Boolean).join('\n')
}

const results = await pipeline(
  plugins,
  function (p) {
    return agent(evalPrompt(p), {
      label: 'eval:' + p.slug,
      phase: 'Evaluate',
      agentType: 'general-purpose',
      effort: 'high',
      schema: EVAL_SCHEMA,
      gate: 'test -s ' + OUT + '/' + p.slug + '.md',
    })
  },
  function (ev, p) {
    return agent(verifyPrompt(p), { label: 'verify:' + p.slug, phase: 'Verify', agentType: 'general-purpose', effort: 'medium', schema: VERIFY_SCHEMA })
      .then(function (qa) { return { ev: ev, qa: qa } })
  },
)

const evals = []
const failed = []
for (let i = 0; i < plugins.length; i++) {
  const r = results[i]
  if (r && r.ev) {
    evals.push(r.ev)
  } else if (r && r.qa && r.qa.total != null) {
    evals.push({ slug: plugins[i].slug, package: plugins[i].package, report_path: OUT + '/' + plugins[i].slug + '.md', technique: r.qa.technique || '', total: r.qa.total, one_line_verdict: 'recovered from verifier', sources_read: [] })
  } else {
    failed.push(plugins[i].slug)
  }
}
log('Done: ' + evals.length + ' reports ok, ' + failed.length + ' failed' + (failed.length ? ': ' + failed.join(', ') : ''))

return {
  plugins_total: plugins.length,
  reports_ok: evals.length,
  failed: failed,
  out_dir: OUT,
  evals: evals,
}