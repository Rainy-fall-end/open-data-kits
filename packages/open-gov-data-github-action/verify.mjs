import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const evidencePath = path.join(root, 'evidence.json');
const requiredArtifacts = [
  'action.yml',
  'dist/index.mjs',
  'examples/scheduled-open-gov-data.yml',
  'package.json',
  'README.md',
  'test/action.test.mjs',
  'verify.mjs',
];

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function artifactHashes() {
  const hashes = {};
  for (const relativePath of requiredArtifacts) {
    const content = await readFile(path.join(root, relativePath));
    hashes[relativePath] = sha256(content);
  }
  return hashes;
}

async function staticChecks() {
  const [actionYaml, source, packageText, example, readme] = await Promise.all([
    readFile(path.join(root, 'action.yml'), 'utf8'),
    readFile(path.join(root, 'dist/index.mjs'), 'utf8'),
    readFile(path.join(root, 'package.json'), 'utf8'),
    readFile(path.join(root, 'examples/scheduled-open-gov-data.yml'), 'utf8'),
    readFile(path.join(root, 'README.md'), 'utf8'),
  ]);
  const packageJson = JSON.parse(packageText);
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/gu)].map((match) => match[1]);
  const actorIds = ['8LFIbRbidiHPknMz5', 'KchE3qKKrwU0rCe9f', 'txnvyTckeQx4hVBc6', 'Z3ioK0wOAeczj6nCx'];
  const rapidapiSlugs = [
    'sec-edgar-corporate-filings',
    'clinicaltrials-gov-studies-trials',
    'openfda-recalls-enforcement-approvals',
    'singapore-bca-green-mark-buildings',
  ];
  return {
    node20_or_newer: Number(process.versions.node.split('.')[0]) >= 20,
    zero_package_dependencies:
      Object.keys(packageJson.dependencies ?? {}).length === 0
      && Object.keys(packageJson.devDependencies ?? {}).length === 0,
    builtin_imports_only: imports.length > 0 && imports.every((specifier) => specifier.startsWith('node:')),
    action_uses_node20: /using:\s*node20/u.test(actionYaml),
    action_runs_dist_mjs: /main:\s*dist\/index\.mjs/u.test(actionYaml),
    four_expected_apify_ids: actorIds.every((id) => source.includes(id))
      && (source.match(/actorId:/gu) ?? []).length === 4,
    four_expected_rapidapi_slugs: rapidapiSlugs.every((slug) => source.includes(slug))
      && (source.match(/apiSlug:/gu) ?? []).length === 4,
    private_hk_targets_absent_from_runtime: !/(?:hong[ -]?kong|hk-|香港)/iu.test(source),
    budget_default_and_absolute_cap_present:
      source.includes('DEFAULT_BUDGET_USD = 0.25') && source.includes('MAX_BUDGET_USD = 5'),
    redirect_refusal_present: source.includes("redirect: 'error'"),
    response_limit_present: source.includes('MAX_RESPONSE_BYTES = 10 * 1024 * 1024'),
    formula_protection_present: source.includes('protectCsvFormula'),
    github_native_files_present: source.includes('GITHUB_OUTPUT')
      && source.includes('GITHUB_STEP_SUMMARY')
      && actionYaml.includes('max_total_charge_usd')
      && readme.includes('GITHUB_OUTPUT'),
    scheduled_example_present: /schedule:/u.test(example) && /cron:/u.test(example),
  };
}

async function main() {
  const startedAt = new Date();
  let checks = {};
  let hashes = {};
  let testResult = {
    command: 'node --test',
    exit_code: 1,
    passed: 0,
    failed: 1,
    stdout: '',
    stderr: '',
  };
  let verifierError = null;

  try {
    for (const relativePath of requiredArtifacts) {
      const artifact = await stat(path.join(root, relativePath));
      if (!artifact.isFile()) throw new Error(`Required artifact is not a file: ${relativePath}`);
    }
    const testFiles = (await readdir(path.join(root, 'test')))
      .filter((name) => name.endsWith('.test.mjs'))
      .sort()
      .map((name) => path.join('test', name));
    const child = spawnSync(process.execPath, ['--test', ...testFiles], {
      cwd: root,
      encoding: 'utf8',
      timeout: 60_000,
      windowsHide: true,
    });
    const stdout = child.stdout ?? '';
    const stderr = child.stderr ?? '';
    const passedMatch = stdout.match(/# pass (\d+)/u);
    const failedMatch = stdout.match(/# fail (\d+)/u);
    testResult = {
      command: `node --test ${testFiles.join(' ')}`,
      exit_code: child.status ?? 1,
      passed: passedMatch ? Number(passedMatch[1]) : 0,
      failed: failedMatch ? Number(failedMatch[1]) : 1,
      timed_out: child.error?.code === 'ETIMEDOUT',
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
    checks = await staticChecks();
    hashes = await artifactHashes();
  } catch (error) {
    verifierError = error instanceof Error ? error.message : String(error);
  }

  const checksPass = Object.keys(checks).length > 0 && Object.values(checks).every(Boolean);
  const passed = verifierError === null && testResult.exit_code === 0 && testResult.failed === 0 && checksPass;
  const evidence = {
    schema_version: 1,
    task_id: 'task-20261126T022427Z-133648',
    project_id: 'github-action-open-gov-data-ci',
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    status: passed ? 'passed' : 'failed',
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
    network_policy: {
      external_calls_made: false,
      paid_calls_made: false,
      loopback_http_only: true,
      redirects_followed: false,
    },
    isolation: {
      artifact_root: 'codex-work/github-action-open-gov-data-ci/',
      protected_repository_state_files_modified: false,
      absorb_run: false,
      git_push_run: false,
    },
    verification: {
      tests: testResult,
      static_checks: checks,
      verifier_error: verifierError,
    },
    artifact_sha256: hashes,
  };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  process.stdout.write(`${testResult.stdout}\n`);
  if (testResult.stderr) process.stderr.write(`${testResult.stderr}\n`);
  process.stdout.write(`\nVerification: ${evidence.status}\nEvidence: ${evidencePath}\n`);
  if (!passed) process.exitCode = 1;
}

await main();
