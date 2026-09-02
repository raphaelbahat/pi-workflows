export const meta = {
  name: 'pi-plugin-pipeline',
  description: 'End-to-end orchestrator: evaluate plugins (args.plugins), then rank them in a comparison document, then optionally produce a stack-recommendations document — composes the three saved pi-plugin workflows',
  phases: [
    { title: 'Eval', detail: 'workflow: pi-plugin-eval' },
    { title: 'Compare', detail: 'workflow: pi-plugin-comparison' },
    { title: 'Recommend', detail: 'optional workflow: pi-plugin-stack-advisor (args.stack)' },
  ],
}

// Defensive args parse: the args transport may deliver a JSON-encoded string.
const A = (typeof args === 'string') ? JSON.parse(args) : (args || {})
const OUT = A.outDir || 'plugin-reports'

if (!A.plugins || !A.plugins.length) {
  throw new Error('args.plugins is required — pass an array of {slug?, package, urls[], notes?} records, bare package names, or URLs')
}

log('Step 1/3 — evaluating ' + A.plugins.length + ' plugins into ' + OUT)
const evalResult = await workflow('pi-plugin-eval', { plugins: A.plugins, outDir: OUT, focus: A.focus })
if (!evalResult || !evalResult.evals || !evalResult.evals.length) {
  return { step: 'eval', result: evalResult }
}
log('Eval done: ' + evalResult.reports_ok + '/' + evalResult.plugins_total + ' reports ok')

log('Step 2/3 — building the comparison document')
const compareResult = await workflow('pi-plugin-comparison', {
  reportsDir: OUT,
  outputFile: A.comparisonFile || 'COMPARISON.md',
  slugs: evalResult.evals.map(function (e) { return e.slug }),
  focus: A.focus,
})

let stackResult = null
if (A.stack) {
  log('Step 3/3 — building the stack-recommendations document')
  stackResult = await workflow('pi-plugin-stack-advisor', {
    comparisonFile: OUT + '/' + (A.comparisonFile || 'COMPARISON.md'),
    reportsDir: OUT,
    outputFile: A.stackOutputFile || 'STACK-RECOMMENDATIONS.md',
  })
} else {
  log('Step 3/3 skipped (args.stack not set)')
}

return {
  eval: { reports_ok: evalResult.reports_ok, failed: evalResult.failed, out_dir: evalResult.out_dir },
  comparison: { records: compareResult ? compareResult.records : 0, output_path: compareResult ? compareResult.output_path : null },
  stack: stackResult ? { output_path: stackResult.output_path, synthesis: stackResult.synthesis } : null,
}