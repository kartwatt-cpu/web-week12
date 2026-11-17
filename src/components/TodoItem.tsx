/**
 * W12 · TodoItem：一行任务，只读展示 + 把操作「通知」父组件。
 *
 * 复审修正（可访问性）：完成状态改由原生 <input type="checkbox"> 承担 ——
 * 它天生可 Tab 聚焦、空格键切换，checked 属性本身就把“完成 / 未完成”暴露给辅助技术；
 * 原先把点击绑在 <li> 上，键盘用户既聚焦不到、读屏也听不出完成状态。
 * 文本用 <label htmlFor> 关联同一个 checkbox，点文字与点方框是同一个动作。
 *
 * 坑（第 11 周 PPT 第 13 页）：const currentTodo = todo 不会创建新对象，
 * 直接写 currentTodo.completed = true 会就地改掉父组件 State 里的那一项。
 * 所以这里一行都不改 todo，只调用父组件传下来的回调。
 */
import type { Todo } from '../todo';

export interface TodoItemProps {
  readonly todo: Todo;
  readonly onToggle: (id: number) => void;
  readonly onRemove: (id: number) => void;
  readonly onEdit: (id: number, text: string) => void;
}

export default function TodoItem({ todo, onToggle, onRemove, onEdit }: TodoItemProps) {
  const checkboxId = 'todo-' + todo.id;

  function handleEditClick(): void {
    const nextText = window.prompt('修改任务', todo.text);
    if (nextText !== null) {
      onEdit(todo.id, nextText);
    }
  }

  return (
    <li className={todo.completed ? 'done' : undefined}>
      <input
        id={checkboxId}
        type="checkbox"
        className="todo-check"
        checked={todo.completed}
        onChange={() => onToggle(todo.id)}
      />
      <label className="todo-text" htmlFor={checkboxId}>
        {todo.text}
      </label>
      <button
        type="button"
        className="todo-edit"
        aria-label={'编辑：' + todo.text}
        onClick={handleEditClick}
      >
        编辑
      </button>
      <button
        type="button"
        className="todo-del"
        aria-label={'删除：' + todo.text}
        onClick={() => onRemove(todo.id)}
      >
        删除
      </button>
    </li>
  );
}