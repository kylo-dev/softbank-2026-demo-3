import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../examples/', import.meta.url);
const image = process.argv[2] || 'iris-demo-web:broken';
const from = new Date().toISOString();
const result = spawnSync('docker', ['run', '--rm', image], { cwd: root, encoding: 'utf8', timeout: 15000 });
const to = new Date().toISOString();
const text = (result.stderr || '') + (result.stdout || '');
if (result.error || result.status !== 1 || !text.includes('ENOENT') || !text.includes('/app/data/tasks.json')) {
  throw new Error('Expected container startup ENOENT. First run: docker build -t iris-demo-web:broken .');
}
const request = {
  success: true,
  message: '테스트 Docker 이미지에서 실제 수집한 시작 실패 로그',
  data: {
    projectId: 'iris-demo-web', serviceId: 'demo-web', deploymentId: 'demo-missing-runtime-file',
    attemptId: 'attempt-1', deploymentStatus: 'FAILED', failedStage: 'runtime', exitCode: result.status,
    logRange: { from, to, isComplete: true },
    logs: [{ id: 'runtime-001', timestamp: from, stage: 'runtime', sourceId: 'demo-container', stream: 'combined', sequence: 1, text }],
    source: null,
  },
};
await mkdir(output, { recursive: true });
await writeFile(new URL('deployment-error.log', output), text);
await writeFile(new URL('deployment-error.request.json', output), JSON.stringify(request, null, 2) + '\n');
console.log('Generated examples/deployment-error.log and examples/deployment-error.request.json from Docker');
