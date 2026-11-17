/**
 * W12 复审 · 可访问性回归：完成状态由原生 <input type="checkbox"> 承担。
 *
 * 自动化能覆盖的部分：控件可聚焦（在 Tab 序列里）、有可访问名、checked 反映完成状态、
 * 与 <label htmlFor> 关联。浏览器里「空格键切换」由原生控件保证 —— 它最终触发的也是
 * checkbox 的 click，所以这里用 click 覆盖同一条链路。
 */
import { beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TodoItem from './TodoItem';
import type { TodoItemProps } from './TodoItem';

const BASE: TodoItemProps = {
  todo: { id: 1, text: '任务A', completed: false },
  onToggle: () => {},
  onRemove: () => {},
  onEdit: () => {},
};

beforeEach(() => {
  cleanup();
});

test('a11y1：完成控件是 checkbox，可访问名就是任务文本', () => {
  render(<TodoItem {...BASE} />);

  const box = screen.getByRole('checkbox', { name: '任务A' });
  expect(box.tagName).toBe('INPUT');
  expect((box as HTMLInputElement).type).toBe('checkbox');
});

test('a11y2：checkbox 在 Tab 序列里，聚焦后 document.activeElement 就是它', () => {
  render(<TodoItem {...BASE} />);

  const box = screen.getByRole('checkbox', { name: '任务A' }) as HTMLInputElement;
  expect(box.tabIndex).toBe(0);
  box.focus();
  expect(document.activeElement).toBe(box);
});

test('a11y3：切换（浏览器里由空格触发）会调用 onToggle，参数是该行 id', () => {
  const onToggle = vi.fn();
  render(<TodoItem {...BASE} onToggle={onToggle} />);

  fireEvent.click(screen.getByRole('checkbox', { name: '任务A' }));

  expect(onToggle).toHaveBeenCalledTimes(1);
  expect(onToggle).toHaveBeenCalledWith(1);
});

test('a11y4：checkbox 与 label 关联，点任务文字与点方框是同一个动作', () => {
  const onToggle = vi.fn();
  render(<TodoItem {...BASE} onToggle={onToggle} />);

  const box = screen.getByRole('checkbox', { name: '任务A' }) as HTMLInputElement;
  const label = screen.getByText('任务A');
  expect(label.getAttribute('for')).toBe(box.id);

  fireEvent.click(label);
  expect(onToggle).toHaveBeenCalledTimes(1);
});

test('a11y5：checked 直接反映完成状态，不需要额外 aria 描述', () => {
  render(<TodoItem {...BASE} todo={{ id: 2, text: '已完成的任务', completed: true }} />);

  const box = screen.getByRole('checkbox', { name: '已完成的任务' }) as HTMLInputElement;
  expect(box.checked).toBe(true);
});

test('a11y6：已完成的行仍然可以取消勾选（不是禁用态）', () => {
  const onToggle = vi.fn();
  render(
    <TodoItem
      {...BASE}
      todo={{ id: 3, text: '已完成的任务', completed: true }}
      onToggle={onToggle}
    />,
  );

  const box = screen.getByRole('checkbox', { name: '已完成的任务' }) as HTMLInputElement;
  expect(box.disabled).toBe(false);
  fireEvent.click(box);
  expect(onToggle).toHaveBeenCalledWith(3);
});