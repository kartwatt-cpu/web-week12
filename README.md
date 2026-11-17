# 个人简历 + Todo V4.0（React 组件 → Context + 持久化）

Web 编程第 11–12 周作业：第 11 周把第 10 周的「原生 DOM + 手动渲染」Todo 重构为 React 组件，
界面只由 `Props` 与 `State` 决定；第 12 周补上 `Context` 主题切换与 `useEffect` 持久化，
并用「单测回归 + UI 行为验证」两条轨道证明迁移与新增都成立。

## 一、这一版做了什么

| 版本 | 关键变化 |
| --- | --- |
| V1.0 | 语义化 HTML 简历 + 手工 DOM 的 Todo |
| V2.0 | 数据驱动：`todos` 数组 + `render()` |
| V3.0 | Vite 工程化 + TypeScript strict + ESLint + Vitest |
| **V4.0** | **React 组件拆分 + useState 状态驱动，零手动 DOM 操作；第 12 周追加 Context 主题切换与 localStorage 持久化** |

组件树（数据向下传，事件向上传）：

```
TodoApp            // 持有 todos / filter / hint 三个 State，唯一更新入口
├── TodoForm       // 收输入，onAdd；只有被受理（返回 true）才清空输入框
└── TodoList       // 只读 todos，按数组渲染
    └── TodoItem   // 一行：展示 + 点击通知父组件
```

数据层 `src/todo.ts`（校验、增删改的纯函数）与 `src/actions.ts`（动作分发）**一行未改**，
组件里所有更新都走同一条路：

```ts
setTodos((prev) => {
  const draft = prev.slice();          // 先复制
  applyTodoAction(draft, action);      // 用 W10 的纯函数改副本
  return draft;                        // 返回新引用，React 才会重新渲染
});
```

## 二、目录结构

```
src/
├── actions.test.ts      # 动作层回归（3 条）
├── actions.ts           # TodoAction 分发（W10 原样保留）
├── components/          # 第 11 周新增：4 个组件 + 6 条行为测试
├── main.tsx             # createRoot 挂载，全项目唯一一次 DOM 查询
├── style.css            # 样式未改动，复用原有 class
├── test-setup.ts        # 测试环境补丁（Node 25 的 localStorage 会盖住 jsdom）
├── todo.review.test.ts  # 边界用例（8 条）
├── todo.test.ts         # 基础用例（5 条）
└── todo.ts              # 数据层纯函数（W10 原样保留）
```

## 三、脚本

```bash
npm run dev      # 本地开发，5173 端口
npm run build    # tsc --noEmit && vite build
npm run test     # vitest run，当前 31 条全绿
npm run lint     # eslint src/，0 error / 0 warning
```

## 四、双轨验证

- **轨道 A（业务逻辑没被破坏）**：`todo.ts` 的 16 条用例原样通过 —— 空值、
  201 字超长、`<script>` 清洗、脏 id、重复文本等规则全部还在。
- **轨道 B（UI 真的由 State 驱动）**：`src/components/TodoApp.test.tsx` 用
  Testing Library 点真实节点，断言列表、`done` 类、计数与 `localStorage` 同步；
  另外在构建产物里用浏览器点了一遍「添加 → 切换 → 删除」。
- **源码级自查**：`document.*` / `innerHTML` / `createElement` / `appendChild`
  在全项目只剩 `main.tsx` 里挂载点那一次 `document.getElementById('root')`。

## 五、README 里记一笔踩过的坑

1. Node 25 自带实验性的全局 `localStorage`，会盖住 jsdom 的实现，连 `clear()` 都没有；
   用 `src/test-setup.ts` 补一个内存版 `Storage` 之后，6 条组件测试才跑起来。
2. `getByLabelText` 返回 `HTMLElement`，`.value` 不存在，`tsc --noEmit` 直接拦下；
   断言前显式收窄成 `HTMLInputElement`。
3. 靶子代码「只修引用、保留 `innerHTML`」的版本（PPT 第 27 页第二关）确实能过编译，
   但 `setTodos(todos)` 传的是同一个引用，点击任务页面不会变；验证记录见
   `docs/task3-v1-check.tsx.txt`。

## 六、第 12 周：Context 主题切换 + useEffect 持久化

| 新增文件 | 作用 |
| --- | --- |
| `src/theme/ThemeContext.tsx` | `createContext` + `ThemeProvider` + `useTheme`；默认值给 `undefined`，脱离 Provider 直接抛错 |
| `src/components/ThemeToggle.tsx` | 主题消费者之一，不接收任何 Props |
| `src/theme/ThemeContext.test.tsx` | 5 条用例：默认 light、切换、读回已存主题、脏值回落、Provider 外抛错 |
| `src/components/TodoPersistence.test.tsx` | 4 条用例：已有数据不被覆盖、坏数据回落、StrictMode 双执行、新增后写回两条 |

改动点（W10 的 `todo.ts` / `actions.ts` 一行未动）：

1. `theme` 走 Context：`TodoApp` 与 `ThemeToggle` 各自 `useTheme()`，中间层不写任何 Props；
   深色样式由 `[data-theme='dark']` 的 CSS 覆盖，不靠传属性。
2. `value` 用 `useMemo`、`toggleTheme` 用 `useCallback`，避免 Provider 每次渲染都换新引用。
3. 持久化沿用「惰性初始化 + 单 Effect 写入」：`useState(loadTodos)` 只读一次，
   `useEffect(..., [todos])` 是全场唯一写入点；脏数据由 `parseTodos` 的两道闸门（try-catch + `Array.isArray`）挡住。
4. 主题自身也持久化到 `localStorage.theme`，写失败（隐私模式）只吞异常、不影响切换。

验证：`test` 31 条全绿（原 22 条 + 本周 9 条），`build` 与 `lint` 0 错；浏览器实点三张截图在 `shots/`，
覆盖风险的打点实验见 `docs/task3-overwrite-check.tsx.txt`，本周 AI 协作日志见 `docs/AI协作日志W12.docx`。
