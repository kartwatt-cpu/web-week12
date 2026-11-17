/**
 * W12 · 持久化行为测试：把「三层审查」里能自动断言的部分固定下来。
 *
 * 三个用例对应文档里的三次审查 + 动手验证：
 *   ① 首次加载读到已有数据，而不是被空数组覆盖（数据正确性）；
 *   ② 脏数据（非法 JSON / 不是数组）不让页面崩，回落到空列表（读取防护）；
 *   ③ StrictMode 下 Effect 多跑一次也不会清空数据（生命周期正确性）。
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

function readStored(): unknown {
  return JSON.parse(localStorage.getItem('todos') ?? 'null');
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
  expect(readStored()).toEqual(SAMPLE);
});

test('持久化2：非法 JSON / 非数组一律回落到空列表，页面不崩', () => {
  localStorage.setItem('todos', '{ 这不是 JSON');
  renderApp();
  expect(screen.getByText('还没有任务，先添加一条吧。')).toBeDefined();
  cleanup();

  localStorage.setItem('todos', '{"id":1}');
  renderApp();
  expect(screen.getByText('还没有任务，先添加一条吧。')).toBeDefined();
});

test('持久化3：StrictMode 下 Effect 重复执行，已有数据仍然在，没有被覆盖成空数组', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  localStorage.setItem('todos', JSON.stringify(SAMPLE));

  renderApp(true);

  expect(screen.getByText('测试任务')).toBeDefined();
  expect(readStored()).toEqual(SAMPLE);
});

test('持久化4：新增一条后写回的是「新数组」，两条都在', () => {
  localStorage.setItem('todos', JSON.stringify(SAMPLE));
  renderApp();

  fireEvent.change(screen.getByLabelText('待办事项内容'), { target: { value: '第二条' } });
  fireEvent.click(screen.getByRole('button', { name: '添加' }));

  const stored = readStored() as { text: string }[];
  expect(stored.map((todo) => todo.text)).toEqual(['测试任务', '第二条']);
});