import { cp, mkdir, mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));

// 이 프로젝트 Dockerfile의 단순 COPY 명령만 재현하는 테스트 도우미입니다.
// 실제 컨테이너 검증은 docker build/run으로 별도 수행합니다.
export async function runtimeSnapshot(dockerfile = null) {
  const content = dockerfile ?? await readFile(join(projectRoot, 'Dockerfile'), 'utf8');
  const runtime = await mkdtemp(join(tmpdir(), 'iris-deployment-test-'));
  for (const line of content.split('\n').filter(line => line.startsWith('COPY '))) {
    const match = line.match(/^COPY(?:\s+--chown=\S+)?\s+(\S+)\s+(\S+)\s*$/);
    if (!match) throw new Error('Unsupported COPY syntax in fixture test');
    const [, source, destination] = match;
    const from = resolve(projectRoot, source);
    let to = resolve(runtime, destination);
    if (!from.startsWith(projectRoot) || (to !== runtime && !to.startsWith(runtime + sep))) {
      throw new Error('Unsafe COPY path in fixture test');
    }
    if ((await stat(from)).isFile() && destination.endsWith('/')) to = join(to, basename(source));
    await mkdir(resolve(to, '..'), { recursive: true });
    await cp(from, to, { recursive: true });
  }
  return runtime;
}
