// Guards against the production regression where the Next.js proxy / API client
// pointed at http://localhost:8000 (which, in a container, is the frontend
// itself, not the backend service).
//
// Run with: npm test   (uses Node's built-in test runner, no extra dependency)
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(here, '..');
const configPath = join(frontendRoot, 'next.config.js');
const apiTsPath = join(frontendRoot, 'src', 'lib', 'api.ts');
const apiJsPath = join(tmpdir(), `ragh-api-${process.pid}.cjs`);

const PRODUCTION_BACKEND = 'https://rag-hallucination-demo-back.onrender.com';
const LOCALHOST = /localhost|127\.0\.0\.1/;
const ENV_KEYS = ['NODE_ENV', 'RENDER', 'BACKEND_URL'];

after(() => {
  try {
    rmSync(apiJsPath, { force: true });
  } catch {
    // best effort cleanup
  }
});

// Load next.config.js with a controlled environment and return the proxy target.
async function rewriteDestination(env) {
  const saved = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
  delete require.cache[require.resolve(configPath)];
  try {
    const config = require(configPath);
    const rewrites = await config.rewrites();
    return rewrites[0].destination;
  } finally {
    delete require.cache[require.resolve(configPath)];
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

// Transpile the real api.ts (its only import is `import type`, which is erased)
// and evaluate it to inspect the computed base URL.
function loadApiBaseUrl(nextPublicApiUrl) {
  const js = ts.transpileModule(readFileSync(apiTsPath, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  writeFileSync(apiJsPath, js);
  delete require.cache[require.resolve(apiJsPath)];

  const saved = process.env.NEXT_PUBLIC_API_URL;
  if (nextPublicApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = nextPublicApiUrl;

  try {
    return require(apiJsPath).API_BASE_URL;
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = saved;
    delete require.cache[require.resolve(apiJsPath)];
  }
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

// --- Next.js proxy target (next.config.js) ---------------------------------

test('production without BACKEND_URL proxies to the real backend, never localhost', async () => {
  const dest = await rewriteDestination({ NODE_ENV: 'production' });
  assert.equal(dest, `${PRODUCTION_BACKEND}/api/:path*`);
  assert.doesNotMatch(dest, LOCALHOST);
});

test('RENDER=true is treated as production even when NODE_ENV is unset', async () => {
  const dest = await rewriteDestination({ RENDER: 'true' });
  assert.match(dest, /rag-hallucination-demo-back\.onrender\.com/);
  assert.doesNotMatch(dest, LOCALHOST);
});

test('BACKEND_URL overrides the proxy target and a trailing slash is stripped', async () => {
  const dest = await rewriteDestination({
    NODE_ENV: 'production',
    BACKEND_URL: 'https://example.test/',
  });
  assert.equal(dest, 'https://example.test/api/:path*');
  assert.doesNotMatch(dest, /\/\/api/);
});

test('development keeps the localhost default (only outside production)', async () => {
  const dest = await rewriteDestination({ NODE_ENV: 'development' });
  assert.equal(dest, 'http://localhost:8000/api/:path*');
});

// --- API client (src/lib/api.ts) -------------------------------------------

test('client falls back to the same-origin /api prefix', () => {
  assert.equal(loadApiBaseUrl(''), '/api');
  assert.equal(loadApiBaseUrl(undefined), '/api');
});

test('client appends /api exactly once for an absolute backend URL', () => {
  assert.equal(
    loadApiBaseUrl(PRODUCTION_BACKEND),
    `${PRODUCTION_BACKEND}/api`,
  );
  assert.equal(
    loadApiBaseUrl(`${PRODUCTION_BACKEND}/`),
    `${PRODUCTION_BACKEND}/api`,
  );
  assert.equal(
    loadApiBaseUrl(`${PRODUCTION_BACKEND}/api`),
    `${PRODUCTION_BACKEND}/api`,
  );
  assert.equal(
    loadApiBaseUrl(`  ${PRODUCTION_BACKEND}/  `),
    `${PRODUCTION_BACKEND}/api`,
  );
});

// --- static guarantee ------------------------------------------------------

test('no client source file hardcodes localhost:8000', () => {
  const offenders = walk(join(frontendRoot, 'src')).filter((file) =>
    /localhost:8000|127\.0\.0\.1:8000/.test(readFileSync(file, 'utf8')),
  );
  assert.deepEqual(offenders, []);
});
