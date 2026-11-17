/**
 * W12 · 持久化行为测试：把「三层审查」里能自动断言的部分固定下来。
 *
 * 复审修正后多了一条硬约束：读取失败（抛错 / 数据不是合法数组）时**不许**写回，
 * 否则一次暂时的读取失败就会把原数据覆盖成空数组。这里把四种情况都钉住：
 *   ① 读到已有数据 → 页面用它，且写回的就是它；
 *   ② 数据坏了 / 读取抛错 → 提示 + 暂停写入，原数据原样留在存储里；
 *   ③ 用户点「重新读取」恢复自动保存，点「以当前内容覆盖」才允许写回；
 *   ④ StrictMode 下 Effect 重复执行不会清空数据。
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import TodoApp from './TodoApp';
import { ThemeProvider } from '../theme/ThemeContext';

const SAMPLE = [{ id: 1, text: '测试任务', completed: false }];

function renderApp(strict = false): void {
  const tree = (
    <ThemeProvider>
      <TodoApp />
    </ThemeProvider>
  );
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

function addTask(text: string): void {
  fireEvent.change(screen.getByLabelText('待办事项内容'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: '添加' }));
}

function readStored(): unknown {
  return JSON.parse(localStorage.getItem('todos') ?? 'null');
}

/** 用一层可控 Storage 替换全局实现，测完必须 restore。 */
function swapStorage(next: Storage): () => void {
  const real = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { value: next, configurable: true });
  return () => {
    Object.defineProperty(globalThis, 'localStorage', { value: real, configurable: true });
  };
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('持久化1：localStorage 里已有数据时，首次渲染就读到它，且没有被空数组覆盖', () => {
  localStorage.setItem('todos', JSON.stringify(SAMPLE));

  renderApp();

  expect(screen.getByText('测试任务')).toBeDefined();
  expect(screen.getByText('共 1 项 · 未完成 1 项')).toBeDefined();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(readStored()).toEqual(SAMPLE);
});

test('持久化2：数据坏了不覆盖原数据 —— 提示并暂停保存', () => {
  localStorage.setItem('todos', '{ 这不是 JSON');
  renderApp();
  expect(screen.getByText('还没有任务，先添加一条吧。')).toBeDefined();
  expect(screen.getByText(/不是合法 JSON/)).toBeDefined();
  expect(localStorage.getItem('todos')).toBe('{ 这不是 JSON');
  cleanup();

  localStorage.setItem('todos', '{"id":1}');
  renderApp();
  expect(screen.getByText(/不是数组/)).toBeDefined();
  expect(localStorage.getItem('todos')).toBe('{"id":1}');
});

test('持久化3：StrictMode 下 Effect 重复执行，已有数据仍然在，没有被覆盖成空数组', () => {
  localStorage.setItem('todos', JSON.stringify(SAMPLE));

  renderApp(true);

  expect(screen.getByText('测试任务')).toBeDefined();
  expect(readStored()).toEqual(SAMPLE);
});

test('持久化4：新增一条后写回的是「新数组」，两条都在', () => {
  localStorage.setItem('todos', JSON.stringify(SAMPLE));
  renderApp();

  addTask('第二条');

  const stored = readStored() as { text: string }[];
  expect(stored.map((todo) => todo.text)).toEqual(['测试任务', '第二条']);
});

test('持久化5：读取抛错时提示并暂停自动保存，新增任务不会写回存储', () => {
  const written: string[] = [];
  const failing: Storage = {
    get length() {
      return 0;
    },
    clear() {},
    getItem(): string | null {
      throw new Error('storage unavailable');
    },
    key(): string | null {
      return null;
    },
    removeItem() {},
    setItem(key: string): void {
      written.push(key);
    },
  };
  const restore = swapStorage(failing);
  try {
    renderApp();

    expect(screen.getByText(/读取本地数据失败/)).toBeDefined();
    expect(screen.getByRole('alert')).toBeDefined();

    addTask('任务A');
    expect(screen.getByText('任务A')).toBeDefined(); // 内存里照常能加
    expect(written).not.toContain('todos'); // 但没有写回 todos，原数据不会被空数组盖掉
  } finally {
    restore();
  }
});

test('持久化6：点「重新读取本地数据」后恢复自动保存，数据回来', () => {
  const real = localStorage;
  real.setItem('todos', JSON.stringify(SAMPLE));
  let failedOnce = false;
  // 只让 todos 的第一次读取失败（主题读取要走得通，否则测的就不是待办这条路径了）
  const flaky: Storage = {
    get length() {
      return real.length;
    },
    clear() {
      real.clear();
    },
    getItem(key: string): string | null {
      if (key === 'todos' && !failedOnce) {
        failedOnce = true;
        throw new Error('temporarily unavailable');
      }
      return real.getItem(key);
    },
    key(index: number): string | null {
      return real.key(index);
    },
    removeItem(key: string) {
      real.removeItem(key);
    },
    setItem(key: string, value: string) {
      real.setItem(key, value);
    },
  };
  const restore = swapStorage(flaky);
  try {
    renderApp();
    expect(screen.getByText(/读取本地数据失败/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: '重新读取本地数据' }));

    expect(screen.getByText('测试任务')).toBeDefined();
    expect(screen.queryByText(/自动保存已暂停/)).toBeNull();
    expect(real.getItem('todos')).toBe(JSON.stringify(SAMPLE));
  } finally {
    restore();
  }
});

test('持久化7：只有点了「以当前内容覆盖」，才允许把空列表写回去', () => {
  localStorage.setItem('todos', '{ 这不是 JSON');
  renderApp();

  expect(localStorage.getItem('todos')).toBe('{ 这不是 JSON'); // 用户没确认前不动它

  fireEvent.click(screen.getByRole('button', { name: '以当前内容覆盖' }));

  expect(localStorage.getItem('todos')).toBe('[]');
});

test('持久化8：StrictMode 下新增一条只得到一条，id 是事件阶段生成的稳定值', () => {
  renderApp(true);

  addTask('任务A');

  const stored = readStored() as { id: number }[];
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(stored).toHaveLength(1);
  expect(Number.isSafeInteger(stored[0].id)).toBe(true);
});