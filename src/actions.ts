import { clearCompleted, editTodo, removeTodo, toggleTodo } from './todo';
import type { Todo } from './todo';

/**
 * 把“字符串动作 + any payload”换成可穷举的字面量联合类型。
 * switch 的分支分别委托给 todo.ts 的纯函数，业务校验仍只有一份。
 *
 * 第 12 周复审修正：add 不再携带“原始文本”，而是携带**已经在事件处理阶段构造好的 Todo**
 * （id 由 nextId() 在事件里生成、文本由 validateTodoText 校验清洗）。
 * 这样这个分发器（会被 setTodos 的 updater 调用）不读时钟、不改模块变量，是真正的纯函数，
 * StrictMode 重复调用同一 action 也不会得到两个不同 id。
 */
export type TodoAction =
  | { readonly type: 'add'; readonly todo: Todo }
  | { readonly type: 'toggle'; readonly id: number }
  | { readonly type: 'remove'; readonly id: number }
  | { readonly type: 'edit'; readonly id: number; readonly text: string }
  | { readonly type: 'clear' };

export function applyTodoAction(todos: Todo[], action: TodoAction): void {
  switch (action.type) {
    case 'add':
      todos.push({ ...action.todo });
      return;
    case 'toggle':
      toggleTodo(todos, action.id);
      return;
    case 'remove':
      removeTodo(todos, action.id);
      return;
    case 'edit':
      editTodo(todos, action.id, action.text);
      return;
    case 'clear':
      clearCompleted(todos);
      return;
  }
}