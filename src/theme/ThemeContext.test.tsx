/**
 * W12 · 主题 Context 的行为测试：证明「值由 Provider 提供、消费者直接读取」这条链路真的通了。
 *
 * 断言三处同时变：按钮文案（消费者 1）、TodoApp 里的主题标记（消费者 2）、
 * localStorage 与 <html data-theme>（Provider 的唯一写入 Effect）。
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import TodoApp from '../components/TodoApp';
import { ThemeProvider, useTheme } from './ThemeContext';

function renderApp(): void {
  render(
    <ThemeProvider>
      <TodoApp />
    </ThemeProvider>,
  );
}

function OutsideProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function BadConsumer() {
  useTheme();
  return <p>不该渲染到这里</p>;
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('主题1：没有存过主题时默认 light，且首次渲染就写回 localStorage 与 <html data-theme>', () => {
  renderApp();

  expect(screen.getByRole('button', { name: /切换到深色主题/ })).toBeDefined();
  expect(screen.getByText('light')).toBeDefined();
  expect(localStorage.getItem('theme')).toBe('light');
  expect(document.documentElement.dataset.theme).toBe('light');
});

test('主题2：点按钮后两个消费者同时变，Context 的值传到了 TodoApp 与 ThemeToggle', () => {
  renderApp();
  fireEvent.click(screen.getByRole('button', { name: /切换到深色主题/ }));

  expect(screen.getByRole('button', { name: /切换到浅色主题/ })).toBeDefined();
  expect(screen.getByText('dark')).toBeDefined();
  expect(document.documentElement.dataset.theme).toBe('dark');
});

test('主题3：localStorage 里已经是 dark 时，首次渲染直接是 dark（惰性初始化，不用 Effect 纠正）', () => {
  localStorage.setItem('theme', 'dark');
  renderApp();

  expect(screen.getByRole('button', { name: /切换到浅色主题/ })).toBeDefined();
  expect(screen.getByText('dark')).toBeDefined();
});

test('主题4：脏值不放大，存了别的东西仍回落到 light', () => {
  localStorage.setItem('theme', 'purple');
  renderApp();

  expect(screen.getByText('light')).toBeDefined();
});

test('主题5：useTheme 在 Provider 外面使用时直接报错，而不是悄悄返回 undefined', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});

  expect(() =>
    render(
      <OutsideProvider>
        <BadConsumer />
      </OutsideProvider>,
    ),
  ).toThrowError('useTheme 必须在 <ThemeProvider> 内部使用');
});