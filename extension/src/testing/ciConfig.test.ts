import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import vitestConfig from '../../vitest.config';

const workflowFile = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '.github',
  'workflows',
  'ci.yml',
);
const workflow = readFileSync(workflowFile, 'utf8');
const jobsStart = workflow.indexOf('\njobs:');
if (jobsStart < 0) throw new Error('The CI workflow defines no jobs section.');
const jobs = workflow.slice(jobsStart);

/** One job's text, from its own key to the next job key at the same indent. */
function job(name: string): string {
  const start = jobs.indexOf(`\n  ${name}:`);
  if (start < 0) throw new Error(`The CI workflow has no \`${name}\` job.`);
  const rest = jobs.slice(start + 1);
  const next = rest.search(/\n {2}[A-Za-z][\w-]*:/);
  return next < 0 ? rest : rest.slice(0, next);
}

// The pipeline half of the spec's contract: the component tests ride the job
// that already exists, and the browser run keeps its own job (spec 0001, AC-1, AC-8).
describe('the pull request pipeline', () => {
  it('keeps the component tests in the run npm test makes (covers AC-1)', () => {
    expect(vitestConfig.test?.include).toContain('src/**/*.test.{ts,tsx}');
    expect(vitestConfig.test?.setupFiles).toContain('src/testing/setup.ts');
  });

  it('runs that suite in the existing verify job (covers AC-1)', () => {
    const verify = job('verify');
    expect(verify).toContain('run: npm test');
    expect(verify).toContain('run: npm run typecheck');
    expect(verify).not.toContain('test:e2e');
  });

  it('runs the end to end suite as its own job (covers AC-8)', () => {
    const e2e = job('e2e');
    expect(e2e).toContain('run: npm run build');
    expect(e2e).toContain('run: npm run test:e2e');
  });

  it('uploads the trace of a failed end to end run (covers AC-8)', () => {
    const e2e = job('e2e');
    expect(e2e).toContain('if: failure()');
    expect(e2e).toContain('actions/upload-artifact');
    expect(e2e).toContain('extension/test-results/');
  });
});
