/**
 * W12 · 轨道 B（组件行为测试）：证明界面是 State 的函数，而不是靠手动改 DOM。
 *
 * 这些用例点的是真实渲染出来的 DOM 节点，但断言的是「React 渲染结果」：
 * 没有任何一处 querySelector / innerHTML，全部通过 screen 查询 + 断言文本与类名。
 *
 * 复审修正后补的失败路径：校验失败时输入框必须保留内容并说明原因，编辑失败也要提示。
 */
import { beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TodoApp from './TodoApp';
import { ThemeProvider } from '../theme/ThemeContext';

function renderApp(): void {
  render(
    <ThemeProvider>
      <TodoApp />
    </ThemeProvider>,
  );
}

function typeText(text: string): void {
  fireEvent.change(screen.getByLabelText('待办事项内容'), { target: { value: text } });
}

function addTodo(text: string): void {
  typeText(text);
  fireEvent.click(screen.getByRole('button', { name: '添加' }));
}

function inputValue(): string {
  return (screen.getByLabelText('待办事项内容') as HTMLInputElement).value;
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

test('行为1：添加任务后列表多一项，输入框被清空', () => {
  renderApp();
  addTodo('任务A');

  expect(screen.getByText('任务A')).toBeDefined();
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(inputValue()).toBe('');
  expect(screen.getByText('共 1 项 · 未完成 1 项')).toBeDefined();
});

test('行为2：纯空白被拦截，只出提示、不新增，输入原样保留', () => {
  renderApp();
  addTodo('   ');

  expect(screen.getAllByRole('listitem')).toHaveLength(1); // 只有空状态那一条
  expect(screen.getByText('内容为空，请输入后再添加。')).toBeDefined();
  expect(inputValue()).toBe('   ');
});

test('行为3：勾选 checkbox 切换完成状态，done 类由 State 决定', () => {
  renderApp();
  addTodo('任务A');

  fireEvent.click(screen.getByRole('checkbox', { name: '任务A' }));

  const item = screen.getByText('任务A').closest('li');
  expect(item?.className).toBe('done');
  expect(screen.getByText('共 1 项 · 未完成 0 项')).toBeDefined();
});

test('行为4：点击删除按钮，列表少一项且计数同步', () => {
  renderApp();
  addTodo('任务A');
  addTodo('任务B');

  fireEvent.click(screen.getByRole('button', { name: '删除：任务A' }));

  expect(screen.queryByText('任务A')).toBeNull();
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByText('共 1 项 · 未完成 1 项')).toBeDefined();
});

test('行为5：筛选按钮只改渲染结果，不改 todos 本身', () => {
  renderApp();
  addTodo('任务A');
  addTodo('任务B');
  fireEvent.click(screen.getByRole('checkbox', { name: '任务A' })); // A 置为完成

  fireEvent.click(screen.getByRole('button', { name: '未完成' }));

  expect(screen.queryByText('任务A')).toBeNull();
  expect(screen.getByText('任务B')).toBeDefined();
  expect(screen.getByText('共 2 项 · 未完成 1 项')).toBeDefined();
});

test('行为6：页面条目与 localStorage 里的 State 逐条一致', () => {
  renderApp();
  addTodo('任务A');
  addTodo('任务B');
  fireEvent.click(screen.getByRole('button', { name: '删除：任务B' }));

  const stored: unknown = JSON.parse(localStorage.getItem('todos') ?? '[]');
  expect(Array.isArray(stored)).toBe(true);
  const list = stored as { text: string; completed: boolean }[];
  const rendered = screen
    .getAllByRole('listitem')
    .map((li) => li.querySelector('.todo-text')?.textContent);
  expect(list.map((todo) => todo.text)).toEqual(rendered);
});

test('行为7：超过 200 字被数据层拦下时，界面保留输入并说明原因（不再“清空但没添加”）', () => {
  renderApp();
  const long = 'a'.repeat(201);
  addTodo(long);

  expect(screen.getAllByRole('listitem')).toHaveLength(1); // 仍然只有空状态
  expect(screen.getByText(/内容超过 200 字/)).toBeDefined();
  expect(inputValue()).toBe(long); // 输入没有被清空
  expect(screen.getByText('共 0 项 · 未完成 0 项')).toBeDefined();
});

test('行为8：<b></b> 清洗后为空时同样给出原因，输入保留', () => {
  renderApp();
  addTodo('<b></b>');

  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByText(/标签/)).toBeDefined();
  expect(inputValue()).toBe('<b></b>');
});

test('行为9：编辑内容不合法时提示失败，原文本保持不变', () => {
  vi.spyOn(window, 'prompt').mockReturnValue('x'.repeat(201));
  renderApp();
  addTodo('任务A');

  fireEvent.click(screen.getByRole('button', { name: '编辑：任务A' }));

  expect(screen.getByText(/^修改失败：/)).toBeDefined();
  expect(screen.getByText('任务A')).toBeDefined();
  vi.restoreAllMocks();
});

test('行为10：编辑内容合法时替换文本，并清掉上一次的提示', () => {
  vi.spyOn(window, 'prompt').mockReturnValue('改好的任务');
  renderApp();
  addTodo('任务A');

  fireEvent.click(screen.getByRole('button', { name: '编辑：任务A' }));

  expect(screen.getByText('改好的任务')).toBeDefined();
  expect(screen.queryByText('任务A')).toBeNull();
  expect(screen.getByRole('status').textContent).toBe('');
  vi.restoreAllMocks();
});