import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const categories = ['개발', '확인', '아이디어'];

export function createTasks() {
  const file = new URL('../data/tasks.json', import.meta.url);
  const initialTasks = JSON.parse(readFileSync(file, 'utf8'));
  return initialTasks.map(task => ({ id: randomUUID(), ...task }));
}
