/**
 * W12 · 主题 Context：跨层级传值的最小实现。
 *
 * 职责边界（对应 PPT 环节④）：
 *   1. Context 只负责「传值」：theme 由 useState 产生，Provider 用 value 交出去；
 *   2. 三个角色分清楚：createContext 给默认值、Provider 提供值、useTheme 消费值；
 *   3. value 用 useMemo 固定引用，只有 theme 变才换新对象 —— 否则每次渲染都是新引用，
 *      所有消费者会被一起安排重渲染；
 *   4. 默认值给 undefined 而不是 'light'：组件在 Provider 外面时能当场报错，
 *      而不是悄悄退化成一个永远切不动的浅色主题。
 *
 * 持久化沿用「惰性初始化 + 单 Effect 写入」：读只在首次渲染做一次，写只有一个 Effect。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Theme = 'light' | 'dark';

export interface ThemeValue {
  readonly theme: Theme;
  readonly toggleTheme: () => void;
}

const THEME_KEY = 'theme';

const ThemeContext = createContext<ThemeValue | undefined>(undefined);

// 取：只有存过 'dark' 才算深色，其余（没有、脏值、被改坏）一律回落到 light。
function loadTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(loadTheme);

  // 存：唯一的写入点，依赖只有 theme。
  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // 隐私模式 / 配额满：主题照常切换，只是不记住。
    }
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const value = useMemo<ThemeValue>(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// 消费：组件拿到的永远是「最近一层 Provider」的值，中间层不需要写任何 Props。
export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (value === undefined) {
    throw new Error('useTheme 必须在 <ThemeProvider> 内部使用');
  }
  return value;
}