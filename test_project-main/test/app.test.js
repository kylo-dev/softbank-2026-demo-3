import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { readFile, rm } from 'node:fs/promises';
import { createApp } from '../src/app.js';
import { projectRoot, runtimeSnapshot } from '../scripts/runtime-snapshot.js';

async function withServer(run) {
  const server = createApp({ title: '테스트' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('웹 페이지와 상태 확인 API가 정상 응답한다', async () => {
  await withServer(async base => {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /type="module"/);
    const health = await (await fetch(base + '/healthz')).json();
    assert.equal(health.status, 'ok');
    assert.equal((await fetch(base + '/src/config.js')).status, 404);
  });
});

test('할 일을 추가하고 완료한 뒤 삭제할 수 있다', async () => {
  await withServer(async base => {
    const headers = { 'Content-Type': 'application/json' };
    const initial = await (await fetch(base + '/api/tasks')).json();
    assert.equal(initial.tasks.length, 3);
    const response = await fetch(base + '/api/tasks', { method: 'POST', headers, body: JSON.stringify({ title: '통합 테스트', category: '확인' }) });
    assert.equal(response.status, 201);
    const { task } = await response.json();
    const changed = await fetch(base + '/api/tasks/' + task.id, { method: 'PATCH', headers, body: JSON.stringify({ done: true }) });
    assert.equal((await changed.json()).task.done, true);
    assert.equal((await fetch(base + '/api/tasks/' + task.id, { method: 'DELETE' })).status, 204);
    const end = await (await fetch(base + '/api/tasks')).json();
    assert.equal(end.tasks.length, 3);
    assert.equal(end.tasks.some(item => item.id === task.id), false);
  });
});

test('빈 제목과 잘못된 JSON을 거절하고 서버를 유지한다', async () => {
  await withServer(async base => {
    const headers = { 'Content-Type': 'application/json' };
    for (const body of ['{', JSON.stringify({ title: ' ', category: '개발' }), 'null']) {
      assert.equal((await fetch(base + '/api/tasks', { method: 'POST', headers, body })).status, 400);
    }
    assert.equal((await fetch(base + '/healthz')).status, 200);
  });
});

test('기본 Dockerfile에 포함된 파일만 배포하면 시작 중 ENOENT로 종료된다', async t => {
    const runtime = await runtimeSnapshot();
    t.after(() => rm(runtime, { recursive: true, force: true }));
    const result = spawnSync(process.execPath, ['src/server.js'], { cwd: runtime, env: { ...process.env, PORT: '3000' }, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ENOENT/);
    assert.match(result.stderr, /data\/tasks\.json/);
    assert.doesNotMatch(result.stdout, /\[ready\]/);
});

test('Dockerfile에 data 복사를 추가한 파일 구성은 정상 응답한다', async t => {
  const dockerfile = await readFile(join(projectRoot, 'Dockerfile'), 'utf8');
  const runtime = await runtimeSnapshot(dockerfile + '\nCOPY --chown=node:node data ./data\n');
  t.after(() => rm(runtime, { recursive: true, force: true }));
  const fixed = await import(pathToFileURL(join(runtime, 'src/app.js')).href);
  const server = fixed.createApp({ title: '수정 후 검증' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/tasks`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).tasks.length, 3);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
