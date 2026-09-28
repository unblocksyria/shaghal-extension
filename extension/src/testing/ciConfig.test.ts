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

/** The text of one job, up to the next job key. */
function job(name: string): string {
  const start = jobs.indexOf(`\n  ${name}:`);
  if (start < 0) throw new Error(`The CI workflow has no \`${name}\` job.`);
  const rest = jobs.slice(start + 1);
  const next = rest.search(/\n {2}[A-Za-z][\w-]*:/);
  return next < 0 ? rest : rest.slice(0, next);
}

// Vitest runs in the `verify` job. The browser suite has its own `e2e` job.
describe('the pull request pipeline', () => {
  it('keeps the component tests in the run npm test makes', () => {
    expect(vitestConfig.test?.include).toContain('src/**/*.test.{ts,tsx}');
    expect(vitestConfig.test?.setupFiles).toContain('src/testing/setup.ts');
  });

  it('runs that suite in the existing verify job', () => {
    const verify = job('verify');
    expect(verify).toContain('run: npm run test:coverage');
    expect(verify).toContain('codecov/codecov-action');
    expect(verify).toContain('run: npm run typecheck');
    expect(verify).not.toContain('test:e2e');
  });

  it('builds for both browsers and lints the Firefox build', () => {
    const verify = job('verify');
    expect(verify).toContain('run: npm run build\n');
    expect(verify).toContain('run: npm run build:firefox');
    expect(verify).toContain('run: npm run lint:firefox');
  });

  it('runs the end to end suite as its own job', () => {
    const e2e = job('e2e');
    expect(e2e).toContain('run: npm run build');
    expect(e2e).toContain('run: npm run test:e2e');
  });

  it('uploads the trace of a failed end to end run', () => {
    const e2e = job('e2e');
    expect(e2e).toContain('if: failure()');
    expect(e2e).toContain('actions/upload-artifact');
    expect(e2e).toContain('extension/test-results/');
  });
});
