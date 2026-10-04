const $ = selector => document.querySelector(selector);
let tasks = [];
let filter = 'all';
let busy = false;

$('#today').textContent = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());

async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  if (response.status === 204) return;
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '요청을 처리하지 못했어요.');
  return result;
}

function message(text, error = false) {
  $('#message').textContent = text;
  $('#message').classList.toggle('error', error);
}

function render() {
  const done = tasks.filter(task => task.done).length;
  const active = tasks.length - done;
  const percent = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  for (const [id, value] of Object.entries({ 'total-badge': tasks.length, 'all-count': tasks.length, 'active-count': active, 'done-count': done, 'stat-total': tasks.length, 'stat-active': active, 'stat-done': done, 'progress-number': percent })) {
    document.getElementById(id).textContent = value;
  }
  $('#progress').value = percent;
  $('#progress-message').textContent = tasks.length ? `${tasks.length}개 중 ${done}개 완료했어요. ${active ? '좋은 흐름이에요!' : '모두 끝냈어요!'}` : '첫 번째 할 일부터 시작해 볼까요?';
  const visible = tasks.filter(task => filter === 'all' || (filter === 'done' ? task.done : !task.done));
  $('#task-list').replaceChildren();
  for (const task of visible) {
    const row = document.createElement('li');
    row.className = `task${task.done ? ' done' : ''}`;
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;
    checkbox.disabled = busy;
    checkbox.addEventListener('change', () => mutate(async () => {
      const result = await request(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ done: checkbox.checked }) });
      tasks = tasks.map(item => item.id === task.id ? result.task : item);
    }, checkbox.checked ? '하나 더 완료했어요. 잘했어요!' : '다시 진행 중으로 옮겼어요.'));
    const name = document.createElement('span');
    name.className = 'task-name';
    name.textContent = task.title;
    label.append(checkbox, name);
    const category = document.createElement('span');
    category.className = 'category';
    category.dataset.category = task.category;
    category.textContent = task.category;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete';
    remove.textContent = '×';
    remove.disabled = busy;
    remove.setAttribute('aria-label', `${task.title} 삭제`);
    remove.addEventListener('click', () => mutate(async () => {
      await request(`/api/tasks/${task.id}`, { method: 'DELETE' });
      tasks = tasks.filter(item => item.id !== task.id);
    }, '할 일을 삭제했어요.'));
    row.append(label, category, remove);
    $('#task-list').append(row);
  }
  $('#empty-state').hidden = visible.length > 0;
  $('#empty-state h3').textContent = filter === 'done' ? '완료한 할 일이 아직 없어요' : filter === 'active' && tasks.length ? '모든 할 일을 끝냈어요!' : '아직 할 일이 없어요';
  $('#empty-state p').textContent = filter === 'done' ? '할 일 옆 체크박스를 눌러 완료해 보세요.' : '위에서 새로운 할 일을 추가해 보세요.';
}

async function mutate(action, success) {
  if (busy) return;
  busy = true;
  $('#task-form button').disabled = true;
  render();
  try {
    await action();
    message(success);
  } catch (error) {
    message(error.message === 'Failed to fetch' ? '서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.' : error.message, true);
  } finally {
    busy = false;
    $('#task-form button').disabled = false;
    render();
  }
}

$('#task-form').addEventListener('submit', event => {
  event.preventDefault();
  const title = $('#task-input').value.trim();
  const category = $('#task-category').value;
  if (!title) return message('할 일을 입력해 주세요.', true);
  mutate(async () => {
    const result = await request('/api/tasks', { method: 'POST', body: JSON.stringify({ title, category }) });
    tasks.unshift(result.task);
    $('#task-input').value = '';
    $('#task-input').focus();
  }, '새로운 할 일을 추가했어요.');
});

for (const button of document.querySelectorAll('[data-filter]')) {
  button.addEventListener('click', () => {
    filter = button.dataset.filter;
    for (const item of document.querySelectorAll('[data-filter]')) item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
    render();
  });
}

try {
  const data = await request('/api/tasks');
  tasks = data.tasks;
  $('#app-title').textContent = data.title;
  document.title = `${data.title} · IRIS`;
  $('#connection').textContent = '서버 연결됨';
  $('#connection').classList.add('online');
  render();
} catch {
  $('#connection').textContent = '연결 실패';
  $('#connection').classList.add('offline');
  $('#task-form button').disabled = true;
  message('할 일을 불러오지 못했어요. 서버를 확인한 뒤 새로고침해 주세요.', true);
}
