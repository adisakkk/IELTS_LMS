#!/usr/bin/env node

import { spawn } from 'node:child_process';

const baseUrl = process.env.BACKEND_BASE_URL ?? 'http://127.0.0.1:4000';
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY ?? 25);
const requestCount = Number(process.env.LOAD_TEST_REQUESTS ?? 100);
const scenario = process.env.LOAD_TEST_SCENARIO ?? 'schedule-start-surge';
const requestDelayMs = Number(process.env.LOAD_TEST_REQUEST_DELAY_MS ?? 0);
const restartAfterMs = Number(process.env.LOAD_TEST_RESTART_AFTER_MS ?? 2000);
const restartCommandTimeoutMs = Number(process.env.LOAD_TEST_RESTART_CMD_TIMEOUT_MS ?? 60000);
const restartTrafficScenario = process.env.LOAD_TEST_RESTART_TRAFFIC_SCENARIO ?? 'heartbeat-sustained';

const scenarios = {
  'schedule-start-surge': {
    method: 'POST',
    path: process.env.LOAD_TEST_BOOTSTRAP_PATH,
    body: process.env.LOAD_TEST_BOOTSTRAP_BODY,
  },
  'mutation-burst': {
    method: 'POST',
    path: process.env.LOAD_TEST_MUTATION_PATH,
    body: process.env.LOAD_TEST_MUTATION_BODY,
  },
  'heartbeat-sustained': {
    method: 'POST',
    path: process.env.LOAD_TEST_HEARTBEAT_PATH,
    body: process.env.LOAD_TEST_HEARTBEAT_BODY,
  },
  'restart-during-live-traffic': {
    restart: true,
    trafficScenario: restartTrafficScenario,
  },
};

if (!scenarios[scenario]) {
  console.error(`Unknown scenario "${scenario}". Expected one of: ${Object.keys(scenarios).join(', ')}`);
  process.exit(1);
}

function resolveScenario(config) {
  if (!config.restart) {
    return config;
  }

  if (!scenarios[config.trafficScenario] || scenarios[config.trafficScenario].restart) {
    console.error(`Scenario "${scenario}" requires LOAD_TEST_RESTART_TRAFFIC_SCENARIO to be one of: schedule-start-surge, mutation-burst, heartbeat-sustained`);
    process.exit(1);
  }

  if (!process.env.LOAD_TEST_API_RESTART_CMD && !process.env.LOAD_TEST_WORKER_RESTART_CMD) {
    console.error(`Scenario "${scenario}" requires LOAD_TEST_API_RESTART_CMD and/or LOAD_TEST_WORKER_RESTART_CMD.`);
    process.exit(1);
  }

  return scenarios[config.trafficScenario];
}

const activeScenario = scenarios[scenario];
const { method, path, body } = resolveScenario(activeScenario);

if (!path || !body) {
  console.error(`Scenario "${scenario}" requires path and body environment variables.`);
  process.exit(1);
}

function buildRequestPayload(index) {
  try {
    const requestUuid = crypto.randomUUID();
    const expandedBody = body
      .replaceAll('{{index}}', String(index))
      .replaceAll('{{seq}}', String(index + 1))
      .replaceAll('{{uuid}}', requestUuid);
    return JSON.parse(expandedBody);
  } catch (error) {
    console.error(`Invalid JSON body for scenario "${scenario}": ${error.message}`);
    process.exit(1);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

function trimCommandOutput(value) {
  if (!value) {
    return '';
  }

  const normalized = value.trim();
  if (normalized.length <= 1000) {
    return normalized;
  }

  return normalized.slice(normalized.length - 1000);
}

async function runRestartCommand(target, command) {
  if (!command) {
    return {
      target,
      skipped: true,
    };
  }

  const started = performance.now();

  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let finished = false;

    const finalize = (result) => {
      if (finished) {
        return;
      }

      finished = true;
      clearTimeout(timeoutId);
      resolve({
        target,
        command,
        durationMs: Number((performance.now() - started).toFixed(2)),
        ...result,
        stdout: trimCommandOutput(stdout),
        stderr: trimCommandOutput(stderr),
      });
    };

    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
      finalize({
        ok: false,
        timedOut: true,
        exitCode: null,
      });
    }, restartCommandTimeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      finalize({
        ok: false,
        timedOut: false,
        exitCode: null,
        error: error.message,
      });
    });
    child.on('close', (exitCode) => {
      finalize({
        ok: exitCode === 0,
        timedOut: false,
        exitCode,
      });
    });
  });
}

async function runRestartSequence() {
  if (!activeScenario.restart) {
    return null;
  }

  await sleep(restartAfterMs);

  const apiRestart = await runRestartCommand('api', process.env.LOAD_TEST_API_RESTART_CMD);
  const workerRestart = await runRestartCommand('worker', process.env.LOAD_TEST_WORKER_RESTART_CMD);

  return {
    trafficScenario: restartTrafficScenario,
    afterMs: restartAfterMs,
    commandTimeoutMs: restartCommandTimeoutMs,
    apiRestart,
    workerRestart,
  };
}

async function issueRequest(index) {
  if (requestDelayMs > 0) {
    await sleep(requestDelayMs);
  }

  const started = performance.now();
  const payload = buildRequestPayload(index);
  try {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers: {
        'content-type': 'application/json',
        'x-request-id': `load-${scenario}-${index}`,
      },
      body: JSON.stringify(payload),
    });

    const durationMs = performance.now() - started;
    return {
      ok: response.ok,
      status: response.status,
      durationMs,
    };
  } catch (error) {
    const durationMs = performance.now() - started;
    return {
      ok: false,
      status: 0,
      durationMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const started = performance.now();
  const results = [];
  let nextRequest = 0;
  const restartPromise = runRestartSequence();

  async function worker() {
    while (nextRequest < requestCount) {
      const current = nextRequest;
      nextRequest += 1;
      results.push(await issueRequest(current));
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, () => worker()),
  );
  const restart = await restartPromise;

  const durations = results.map(result => result.durationMs).sort((left, right) => left - right);
  const failed = results.filter(result => !result.ok);
  const percentile = (value) => durations[Math.min(durations.length - 1, Math.floor(durations.length * value))] ?? 0;

  console.log(JSON.stringify({
    scenario,
    baseUrl,
    concurrency,
    requestCount,
    requestDelayMs,
    elapsedMs: Number((performance.now() - started).toFixed(2)),
    p50Ms: Number(percentile(0.5).toFixed(2)),
    p95Ms: Number(percentile(0.95).toFixed(2)),
    p99Ms: Number(percentile(0.99).toFixed(2)),
    failureCount: failed.length,
    failuresByStatus: failed.reduce((accumulator, result) => {
      accumulator[result.status] = (accumulator[result.status] ?? 0) + 1;
      return accumulator;
    }, {}),
    restart,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
