import { test, expect } from 'vitest';
import { MAX_TEXT_LENGTH, validateTodoText } from './todo';

// 复审修正（问题 1）：校验只有一份，界面拿到的 reason 就是数据层拒绝的理由。
test('validateTodoText：正常文本返回去掉首尾空白的文本', () => {
  expect(validateTodoText('  学习TS  ')).toEqual({ ok: true, text: '学习TS' });
});

test('validateTodoText：空串与纯空白给出可以直接展示的原因', () => {
  expect(validateTodoText('')).toEqual({ ok: false, reason: '内容为空，请输入后再添加。' });
  expect(validateTodoText('   ')).toEqual({ ok: false, reason: '内容为空，请输入后再添加。' });
});

test('validateTodoText：超过 200 字给出原因，且不偷偷截断', () => {
  const checked = validateTodoText('a'.repeat(MAX_TEXT_LENGTH + 1));
  expect(checked.ok).toBe(false);
  if (!checked.ok) {
    expect(checked.reason).toContain(String(MAX_TEXT_LENGTH));
  }
});

test('validateTodoText：只剩标签的输入被拦下（<b></b> 清洗后为空）', () => {
  const checked = validateTodoText('<b></b>');
  expect(checked.ok).toBe(false);
  if (!checked.ok) {
    expect(checked.reason).toContain('标签');
  }
});

test('validateTodoText：非字符串不会被当成合法文本', () => {
  expect(validateTodoText(null).ok).toBe(false);
  expect(validateTodoText(undefined).ok).toBe(false);
  expect(validateTodoText(123).ok).toBe(false);
});

test('validateTodoText：清洗结果可重复校验（幂等），界面与数据层不会给出不同结论', () => {
  const first = validateTodoText('<b>学习TS</b>');
  expect(first.ok).toBe(true);
  if (first.ok) {
    expect(validateTodoText(first.text)).toEqual({ ok: true, text: '学习TS' });
  }
});