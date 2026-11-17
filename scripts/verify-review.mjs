// 复审修正的真实浏览器验证：校验失败、键盘切换、读取失败暂停写入。
// 用 Chrome DevTools Protocol 发真实按键事件，而不是只改 DOM。
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const APP = process.argv[2] ?? 'http://127.0.0.1:5189/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9232;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const userDataDir = mkdtempSync(path.join(tmpdir(), 'w12-review-'));
const chrome = spawn(
  CHROME,
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--window-size=1200,900',
   '--user-data-dir=' + userDataDir, '--remote-debugging-port=' + PORT, 'about:blank'],
  { stdio: 'ignore' },
);

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    const waiters = new Map();
    let id = 0;
    const send = (method, params = {}) =>
      new Promise((res, rej) => {
        const msgId = ++id;
        pending.set(msgId, { res, rej });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    const once = (method, timeout = 20000) =>
      new Promise((res, rej) => {
        const list = waiters.get(method) ?? [];
        list.push(res);
        waiters.set(method, list);
        setTimeout(() => rej(new Error('timeout: ' + method)), timeout);
      });
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (!p) return;
        msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result);
      } else if (msg.method) {
        const list = waiters.get(msg.method);
        if (list && list.length) list.shift()(msg.params);
      }
    });
    ws.addEventListener('open', () => resolve({ send, once, ws }));
    ws.addEventListener('error', () => reject(new Error('CDP 连接失败')));
  });
}

const TASKS = [
  { id: 1794295660221001, text: '整理第 12 周 Context 笔记', completed: false },
  { id: 1794295660221002, text: '给 ThemeToggle 补一条测试', completed: true },
  { id: 1794295660221003, text: '复习 useEffect 依赖数组', completed: false },
];

try {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) break;
    } catch {}
    await sleep(150);
  }
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const cdp = await connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });

  const evaluate = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const navigate = async () => {
    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: APP });
    await loaded;
    await sleep(700);
  };
  const key = async (k, code, vk) => {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text: k === ' ' ? ' ' : undefined });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
    await sleep(60);
  };
  const activeInfo = () =>
    evaluate(`(() => {
      const el = document.activeElement;
      return { tag: el.tagName, cls: el.className, type: el.type ?? null,
               label: el.labels?.[0]?.textContent ?? null };
    })()`);

  // ---------- A. 校验失败不清空输入 ----------
  await navigate();
  await evaluate(`localStorage.setItem('todos', ${JSON.stringify(JSON.stringify(TASKS))});`);
  await navigate();
  const longText = 'a'.repeat(201);
  await evaluate(`(() => {
    const input = document.querySelector('.todo-input');
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setValue.call(input, ${JSON.stringify(longText)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.todo-add').click();
  })()`);
  await sleep(300);
  console.log('【A 校验失败】', JSON.stringify(await evaluate(`(() => ({
    hint: document.querySelector('.todo-hint').textContent,
    inputLength: document.querySelector('.todo-input').value.length,
    listCount: document.querySelectorAll('.todo-list li').length,
    count: document.querySelector('.todo-count').textContent,
  }))()`), null, 2));

  // ---------- B. 键盘：Tab 到 checkbox，空格切换 ----------
  await navigate();
  const order = [];
  let found = false;
  for (let i = 0; i < 24; i += 1) {
    await key('Tab', 'Tab', 9);
    const info = await activeInfo();
    order.push(info.cls || info.tag);
    if (info.cls === 'todo-check') {
      found = true;
      break;
    }
  }
  const before = await evaluate(`(() => {
    const box = document.querySelector('.todo-check');
    return { checked: box.checked, tabIndex: box.tabIndex, label: box.labels[0].textContent,
             done: document.querySelectorAll('.todo-list li.done').length,
             count: document.querySelector('.todo-count').textContent };
  })()`);
  await key(' ', 'Space', 32);
  const after = await evaluate(`(() => {
    const box = document.querySelector('.todo-check');
    return { checked: box.checked, done: document.querySelectorAll('.todo-list li.done').length,
             count: document.querySelector('.todo-count').textContent };
  })()`);
  console.log('【B 键盘】在 Tab 序列中命中 checkbox =', found, '| 焦点经过：', JSON.stringify(order));
  console.log('    按空格前：', JSON.stringify(before));
  console.log('    按空格后：', JSON.stringify(after));

  // ---------- C. 读取失败：提示 + 暂停写入，用户确认后才覆盖 ----------
  await evaluate(`localStorage.setItem('todos', '{ 这不是 JSON');`);
  await navigate();
  const broken = await evaluate(`(() => ({
    alert: document.querySelector('.todo-warning')?.textContent ?? null,
    hint: document.querySelector('.todo-hint').textContent,
    stored: localStorage.getItem('todos'),
    buttons: [...document.querySelectorAll('.todo-warning-actions button')].map((b) => b.textContent),
  }))()`);
  await evaluate(`(() => {
    const input = document.querySelector('.todo-input');
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setValue.call(input, '读失败时加的一条');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.todo-add').click();
  })()`);
  await sleep(300);
  const afterAdd = await evaluate(`(() => ({
    stored: localStorage.getItem('todos'),
    count: document.querySelector('.todo-count').textContent,
  }))()`);
  await evaluate(`document.querySelector('.todo-warning-overwrite').click()`);
  await sleep(300);
  const afterOverwrite = await evaluate(`localStorage.getItem('todos')`);
  console.log('【C 读取失败】', JSON.stringify({ ...broken, afterAdd: afterAdd, storedAfterOverwrite: afterOverwrite }, null, 2));

  cdp.ws.close();
} finally {
  chrome.kill();
}