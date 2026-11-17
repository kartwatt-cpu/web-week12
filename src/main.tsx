/**
 * W12 · V4.0 入口：整个 React 应用的启动只有这一处 DOM 操作。
 * 页面只给一个空的 <div id="root">，剩下的界面全部由 TodoApp 用 JSX 描述。
 *
 * W12 新增：ThemeProvider 包在最外层 —— Provider 只包需要的子树，
 * 所以它放在这里，而不是放到 TodoApp 内部。
 */
import { createRoot } from 'react-dom/client';
import TodoApp from './components/TodoApp';
import { ThemeProvider } from './theme/ThemeContext';
import './style.css';

const appTitle = import.meta.env.VITE_APP_TITLE ?? '个人简历 · Todo V4.0（Context + 持久化）';
document.title = appTitle;

const container = document.getElementById('root');
if (container === null) {
  throw new Error('缺少挂载点：index.html 里应有 <div id="root"></div>');
}

createRoot(container).render(
  <ThemeProvider>
    <TodoApp />
  </ThemeProvider>,
);