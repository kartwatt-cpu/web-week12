import { test, expect } from 'vitest';
import { applyTodoAction } from './actions';
import type { Todo } from './todo';

// 复审修正后 add 的契约：调用方（事件处理函数）已经把 id 和校验过的文本装进 Todo，
// 分发器只负责把它放进数组 —— 不读时钟、不改模块变量，StrictMode 重复调用结果一致。
test('applyTodoAction：add 放入调用方构造的 Todo，同一动作两次结果相同', () => {
  const made: Todo = { id: 42, text: '学习TS', completed: false };
  const a: Todo[] = [];
  const b: Todo[] = [];
  applyTodoAction(a, { type: 'add', todo: made });
  applyTodoAction(b, { type: 'add', todo: made });

  expect(a).toEqual(b);
  expect(a[0]).toEqual(made);
});

test('applyTodoAction：add 复制传入对象，外部再改不影响已入库的那条', () => {
  const made: Todo = { id: 7, text: '学习TS', completed: false };
  const todos: Todo[] = [];
  applyTodoAction(todos, { type: 'add', todo: made });

  made.completed = true;

  expect(todos[0].completed).toBe(false);
});

test('applyTodoAction：edit 只改目标项的文本', () => {
  const todos: Todo[] = [
    { id: 1, text: '旧文本', completed: false },
    { id: 2, text: '别动我', completed: false },
  ];
  applyTodoAction(todos, { type: 'edit', id: 1, text: '新文本' });

  expect(todos.map((todo) => todo.text)).toEqual(['新文本', '别动我']);
});

test('applyTodoAction：clear 只删已完成', () => {
  const todos: Todo[] = [
    { id: 1, text: '未完成', completed: false },
    { id: 2, text: '已完成', completed: true },
  ];
  applyTodoAction(todos, { type: 'clear' });
  expect(todos.map((todo) => todo.text)).toEqual(['未完成']);
});