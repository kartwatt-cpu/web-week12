/**
 * W12 · V4.0 组件层：Todo 应用（容器组件）。
 *
 * 职责边界：
 *   1. 只在这里持有 todos / filter / hint 三个 State，外加“自动保存是否暂停”标志；
 *   2. 唯一的更新入口 update()：先 slice() 出副本，交给 W10 的纯函数 applyTodoAction 改副本，
 *      再把「新数组」交给 setTodos —— 保证 React 拿到的是新引用；
 *   3. 数据向下传（todos → TodoList → TodoItem），事件向上传（onAdd / onToggle / onRemove / onEdit）；
 *   4. W12：theme 不走 Props，直接 useTheme() 从 Context 读；持久化用惰性初始化 + 单 Effect 写入；
 *   5. 复审修正：① 校验统一走 validateTodoText，界面与数据层不再各判一套；
 *      ② id 在事件处理阶段生成，updater 保持纯净；③ 读取失败与“没有数据”分开处理，
 *      读取失败时暂停自动写入，由用户决定重试还是覆盖。
 */
import { useEffect, useState } from 'react';
import { applyTodoAction } from '../actions';
import type { TodoAction } from '../actions';
import { useTheme } from '../theme/ThemeContext';
import { nextId, parseTodos, validateTodoText } from '../todo';
import type { Filter, Todo } from '../todo';
import ThemeToggle from './ThemeToggle';
import TodoForm from './TodoForm';
import TodoList from './TodoList';

const STORAGE_KEY = 'todos';

interface StoredTodos {
  readonly todos: Todo[];
  /** null 表示确实没有数据（可以放心写回）；字符串表示读失败或数据坏了，必须先暂停写入。 */
  readonly failure: string | null;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

// 取：把三种情况分开 —— 没有数据 / 读取抛错 / 数据不是合法数组。
// 后两种都返回 failure，交给界面提示并暂停自动保存，避免把原数据写成空数组。
function readStored(): StoredTodos {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error: unknown) {
    return {
      todos: [],
      failure: '读取本地数据失败：' + describe(error) + '。已暂停自动保存，避免覆盖原有数据。',
    };
  }
  if (raw === null) {
    return { todos: [], failure: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { todos: [], failure: '本地数据不是合法 JSON，已暂停自动保存，避免覆盖原有数据。' };
  }
  if (!Array.isArray(parsed)) {
    return { todos: [], failure: '本地数据不是数组，已暂停自动保存，避免覆盖原有数据。' };
  }
  return { todos: parseTodos(raw), failure: null };
}

function filterTodos(todos: Todo[], filter: Filter): Todo[] {
  if (filter === 'completed') {
    return todos.filter((todo) => todo.completed);
  }
  if (filter === 'active') {
    return todos.filter((todo) => !todo.completed);
  }
  return todos;
}

export default function TodoApp() {
  // 惰性初始化只读一次；读失败时把原因带进 hint，并把写入先停住。
  const [initial] = useState(readStored);
  const [todos, setTodos] = useState<Todo[]>(initial.todos);
  const [filter, setFilter] = useState<Filter>('all');
  const [hint, setHint] = useState(initial.failure ?? '');
  const [persistPaused, setPersistPaused] = useState(initial.failure !== null);
  // theme 从 Context 读：TodoApp 与 ThemeToggle 都消费它，但两者之间没有 Props 传递。
  const { theme } = useTheme();

  // 存：todos 一变就写回 localStorage；写失败（隐私模式 / 配额满）只提示，不让页面崩。
  // 读取失败过就暂停：宁可不存，也不能拿空数组覆盖还没读出来的原数据。
  useEffect(() => {
    if (persistPaused) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    } catch (error: unknown) {
      setHint('保存失败：' + describe(error));
    }
  }, [todos, persistPaused]);

  // 唯一的更新入口：不改当前 State，改的是副本，返回新引用。
  function update(action: TodoAction): void {
    setTodos((prev) => {
      const draft = prev.slice();
      applyTodoAction(draft, action);
      return draft;
    });
  }

  // 返回 true 表示「已受理」，TodoForm 据此决定要不要清空输入框。
  // 校验和 id 生成都在这里做：失败时保留输入并说明原因，成功时把确定的 Todo 交给纯 updater。
  function handleAdd(text: string): boolean {
    const checked = validateTodoText(text);
    if (!checked.ok) {
      setHint(checked.reason);
      return false;
    }
    setHint('');
    update({ type: 'add', todo: { id: nextId(), text: checked.text, completed: false } });
    return true;
  }

  function handleToggle(id: number): void {
    update({ type: 'toggle', id });
  }

  function handleRemove(id: number): void {
    update({ type: 'remove', id });
  }

  // 编辑同样要给出失败原因：prompt 关掉后文本保持原样，用户在提示行能看到为什么。
  function handleEdit(id: number, text: string): void {
    const checked = validateTodoText(text);
    if (!checked.ok) {
      setHint('修改失败：' + checked.reason);
      return;
    }
    setHint('');
    update({ type: 'edit', id, text: checked.text });
  }

  // 用户选择「重新读取」：读成功就恢复自动保存，读失败就保持暂停再提示一次。
  function retryRead(): void {
    const again = readStored();
    if (again.failure !== null) {
      setHint(again.failure);
      return;
    }
    setTodos(again.todos);
    setPersistPaused(false);
    setHint('已重新读取本地数据，自动保存恢复。');
  }

  // 用户选择「以当前内容覆盖」：明确同意用页面上的数据替换存储里的内容。
  function overwriteStored(): void {
    setPersistPaused(false);
    setHint('已改为保存当前内容，本地原有数据会被覆盖。');
  }

  const shown = filterTodos(todos, filter);
  const remaining = todos.reduce((count, todo) => count + (todo.completed ? 0 : 1), 0);
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api';

  return (
    <div className={theme === 'dark' ? 'todo-app theme-dark' : 'todo-app theme-light'}>
      <div className="section-heading">
        <div>
          <h2>待办事项 Todo</h2>
          <p>V4.0 · Context 主题切换 + useEffect 持久化</p>
        </div>
        <ThemeToggle />
      </div>

      <TodoForm onAdd={handleAdd} />

      <p className="todo-hint" role="status" aria-live="polite">
        {hint}
      </p>

      {persistPaused ? (
        <div className="todo-warning" role="alert">
          <p>自动保存已暂停：本地数据没能读出来，先不写回，免得把原数据覆盖掉。</p>
          <div className="todo-warning-actions">
            <button type="button" className="todo-warning-retry" onClick={retryRead}>
              重新读取本地数据
            </button>
            <button type="button" className="todo-warning-overwrite" onClick={overwriteStored}>
              以当前内容覆盖
            </button>
          </div>
        </div>
      ) : null}

      <div className="todo-filters" role="group" aria-label="筛选待办事项">
        {(['all', 'active', 'completed'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={filter === value ? 'todo-filter is-active' : 'todo-filter'}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === 'all' ? '全部' : value === 'active' ? '未完成' : '已完成'}
          </button>
        ))}
      </div>

      <TodoList
        todos={shown}
        onToggle={handleToggle}
        onRemove={handleRemove}
        onEdit={handleEdit}
      />

      <div className="todo-footer">
        <p className="todo-count">
          共 {todos.length} 项 · 未完成 {remaining} 项
        </p>
        <button type="button" className="todo-clear" onClick={() => update({ type: 'clear' })}>
          清除已完成
        </button>
      </div>

      <p className="todo-meta">
        主题：<code>{theme}</code>（由 Context 提供，TodoApp 直接消费，没有经过任何 Props）
      </p>

      <p className="todo-meta">
        API 基地址：<code>{apiBase}</code> · dev 由 Vite 代理到 localhost:8080，build 后代理失效
      </p>
    </div>
  );
}