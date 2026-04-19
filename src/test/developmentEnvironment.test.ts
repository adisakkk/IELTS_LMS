// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import viteConfigFactory from '../../vite.config';

const projectRoot = path.resolve(__dirname, '../..');
const backendRoot = path.join(projectRoot, 'backend');

function readBackendFile(relativePath: string): string {
  return fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
}

describe('development environment wiring', () => {
  it('proxies frontend api requests to the backend server in dev', () => {
    const config = viteConfigFactory({ command: 'serve', mode: 'development' });

    expect(config.server?.proxy).toBeDefined();
    expect(config.server?.proxy?.['/api']).toMatchObject({
      target: 'http://127.0.0.1:4000',
      changeOrigin: true,
    });
  });

  it('aligns backend compose ports, env defaults, and bootstrap flow', () => {
    const compose = readBackendFile('docker-compose.yml');
    const backendEnv = readBackendFile('.env');
    const backendEnvExample = readBackendFile('.env.example');
    const makefile = readBackendFile('Makefile');
    const pgbouncerUsers = readBackendFile('config/pgbouncer/userlist.txt');

    expect(compose).toContain('"15432:5432"');
    expect(compose).toContain('"16432:6432"');
    expect(compose).toContain('PGBOUNCER_AUTH_FILE: /etc/pgbouncer/userlist.txt');
    expect(compose).toContain('PGBOUNCER_POOL_MODE: session');
    expect(compose).toContain('./config/pgbouncer/userlist.txt:/etc/pgbouncer/userlist.txt:ro');

    for (const envFile of [backendEnv, backendEnvExample]) {
      expect(envFile).toContain('DATABASE_URL=postgres://postgres:postgres@127.0.0.1:16432/ielts');
      expect(envFile).toContain(
        'DATABASE_DIRECT_URL=postgres://postgres:postgres@127.0.0.1:15432/ielts',
      );
      expect(envFile).toContain(
        'DATABASE_MIGRATOR_URL=postgres://postgres:postgres@127.0.0.1:15432/ielts',
      );
      expect(envFile).toContain(
        'DATABASE_WORKER_URL=postgres://postgres:postgres@127.0.0.1:16432/ielts',
      );
    }

    expect(makefile).toContain('bash ./scripts/dev-db-bootstrap.sh');
    expect(pgbouncerUsers).toContain('"postgres" "postgres"');
  });
});
