/**
 * W12 · ThemeToggle：主题消费者之一。
 *
 * 它不接收任何 Props —— theme 和 toggleTheme 都是从 Context 读出来的，
 * 所以无论放在树里第几层，都能直接切换主题。
 */
import { useTheme } from '../theme/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      data-theme={theme}
      aria-pressed={isDark}
      onClick={toggleTheme}
    >
      {isDark ? '切换到浅色主题' : '切换到深色主题'}
      <span className="theme-toggle-current">当前：{isDark ? 'dark' : 'light'}</span>
    </button>
  );
}