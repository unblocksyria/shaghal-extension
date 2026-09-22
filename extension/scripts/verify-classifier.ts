import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyLogs } from '../src/lib/classifier';
import type { RedactedRequestLog } from '../src/lib/redact';
import type { ContentSignal } from '../src/lib/session';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', '__fixtures__');

interface Fixture {
  name: string;
  description: string;
  expectedSuggestion: 'working' | 'failing' | 'none';
  contentSignal: ContentSignal | null;
  logs: RedactedRequestLog[];
}

function loadFixtures(): Fixture[] {
  return readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(join(FIXTURE_DIR, file), 'utf-8')) as Fixture);
}

function verify(): number {
  const fixtures = loadFixtures();
  let failing = 0;
  for (const fixture of fixtures) {
    const verdict = classifyLogs(fixture.logs, fixture.contentSignal ?? undefined);
    const actual = verdict.coreSuggestion ?? 'none';
    const passed = actual === fixture.expectedSuggestion;
    if (!passed) failing += 1;
    console.log(`${passed ? 'PASS' : 'FAIL'}  ${fixture.name} → ${actual} — ${verdict.coreEvidence}`);
    for (const warning of verdict.coreWarnings) console.log(`      warning: ${warning}`);
  }
  return failing;
}

const failing = verify();
console.log(failing === 0 ? '\nAll fixtures pass.' : `\n${failing} fixture(s) failed.`);
process.exit(failing === 0 ? 0 : 1);
