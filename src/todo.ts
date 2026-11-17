/**
 * W10 数据层：沿用 W9 的 Todo 模型与纯数据操作，只做位置迁移。
 *
 * 契约（与单测一一对应）：
 *   1. addTodo：trim 后非空、长度 <= 200 才添加；null / undefined / 非字符串一律拒绝。
 *   2. addTodo：文本里的 HTML 标签在数据层清洗，`<script>` 不会原样入库。
 *   3. toggleTodo：按 id 翻转 completed；id 不存在时安静返回。
 *   4. removeTodo / editTodo / clearCompleted：只动传入的数组，找不到目标时安静返回。
 *   5. parseTodoId：把 dataset.id / URL 里的字符串显式转成 number，
 *      ''、'1.5'、'123abc'、'0' 等脏值全部返回 null。
 *
 * 说明：按 W9 实验约定的函数签名，addTodo/toggleTodo 就地修改传入数组；
 * 应用层（app.ts）先 slice() 出副本再调用，页面状态仍保持“改副本 → 替换 → 保存 → 渲染”。
 */

export interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

export type Filter = 'all' | 'active' | 'completed';

export const MAX_TEXT_LENGTH = 200;

let idSeq = 0;

// 同一毫秒内连续添加也不会撞号；结果仍是安全整数（< 2^53）。
export function nextId(): number {
  idSeq = (idSeq + 1) % 1000;
  return Date.now() * 1000 + idSeq;
}

/** 校验结果：通过时带清洗后的文本，不通过时带可以直接给用户看的原因。 */
export type TodoTextCheck =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: string };

/**
 * 唯一的文本校验入口：界面（事件处理函数）和数据层都调它，
 * 这样“界面上通过了、数据层却拒收”的两套规则不会漂移。
 */
export function validateTodoText(input: unknown): TodoTextCheck {
  if (typeof input !== 'string') {
    return { ok: false, reason: '输入内容无效，请重新输入。' };
  }
  const trimmed = input.trim();
  if (trimmed === '') {
    return { ok: false, reason: '内容为空，请输入后再添加。' };
  }
  if (trimmed.length > MAX_TEXT_LENGTH) {
    return { ok: false, reason: '内容超过 ' + MAX_TEXT_LENGTH + ' 字，请精简后再添加。' };
  }
  const cleaned = trimmed.replace(/<[^>]*>/g, '').trim();
  if (cleaned === '') {
    return { ok: false, reason: '内容去掉标签后为空，请重新输入。' };
  }
  return { ok: true, text: cleaned };
}

// 数据层内部用：校验不过就返回 null。
function normalizeText(input: unknown): string | null {
  const checked = validateTodoText(input);
  return checked.ok ? checked.text : null;
}

/**
 * W10 的批量添加入口：自带 id 生成，保留它是为了不破坏数据层既有的 16 条回归用例。
 * React 应用层**不要**用它 —— id 必须在事件处理阶段生成（见 TodoApp.handleAdd），
 * 否则 setTodos 的 updater 会读时钟、改模块变量，StrictMode 下同一输入得不到同一结果。
 */
export function addTodo(todos: Todo[], text: unknown): void {
  const normalized = normalizeText(text);
  if (normalized === null) {
    return;
  }
  todos.push({ id: nextId(), text: normalized, completed: false });
}

export function toggleTodo(todos: Todo[], id: number): void {
  for (let index = 0; index < todos.length; index += 1) {
    if (todos[index].id === id) {
      todos[index] = { ...todos[index], completed: !todos[index].completed };
      return;
    }
  }
}

export function removeTodo(todos: Todo[], id: number): void {
  const index = todos.findIndex((todo) => todo.id === id);
  if (index === -1) {
    return;
  }
  todos.splice(index, 1);
}

export function editTodo(todos: Todo[], id: number, text: unknown): void {
  const normalized = normalizeText(text);
  if (normalized === null) {
    return;
  }
  const index = todos.findIndex((todo) => todo.id === id);
  if (index === -1) {
    return;
  }
  todos[index] = { ...todos[index], text: normalized };
}

export function clearCompleted(todos: Todo[]): void {
  for (let index = todos.length - 1; index >= 0; index -= 1) {
    if (todos[index].completed) {
      todos.splice(index, 1);
    }
  }
}

// 脏数据入口 1：dataset.id 永远是 string | undefined。
export function parseTodoId(raw: string | undefined): number | null {
  if (raw === undefined) {
    return null;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const id = Number(trimmed);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return null;
  }
  return id;
}

function isTodo(value: unknown): value is Todo {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'number' &&
    Number.isSafeInteger(value.id) &&
    value.id > 0 &&
    'text' in value &&
    typeof value.text === 'string' &&
    'completed' in value &&
    typeof value.completed === 'boolean'
  );
}

// 脏数据入口 2：localStorage 解析后的内容完全不受控。
export function parseTodos(raw: string | null): Todo[] {
  if (raw === null) {
    return [];
  }
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) {
      return [];
    }
    const list: unknown[] = data;
    const result: Todo[] = [];
    for (const item of list) {
      if (isTodo(item)) {
        result.push(item);
      }
    }
    return result;
  } catch {
    return [];
  }
}
