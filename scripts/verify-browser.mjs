// W12 动手验证（浏览器里真跑）：记录 localStorage 的每一次写入，看首次加载到底写了什么。
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const APP = process.argv[2] ?? 'http://127.0.0.1:5188/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9231;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const userDataDir = mkdtempSync(path.join(tmpdir(), 'w12-verify-'));
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

const RECORDER = `(() => {
  window.__writes = [];
  const proto = Storage.prototype;
  const original = proto.setItem;
  proto.setItem = function (key, value) {
    window.__writes.push([key, String(value)]);
    return original.call(this, key, value);
  };
})()`;

const snapshot = `(() => ({
  todos: localStorage.getItem('todos'),
  theme: localStorage.getItem('theme'),
  listTexts: [...document.querySelectorAll('.todo-list li span')].map((s) => s.textContent),
  doneCount: document.querySelectorAll('.todo-list li.done').length,
  count: document.querySelector('.todo-count')?.textContent ?? null,
  htmlTheme: document.documentElement.dataset.theme,
  writes: window.__writes.slice(),
}))()`;

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
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });
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

  const SEED = [{ id: 1, text: '测试任务', completed: false }];

  // 第 1 步：按文档要求，先在 localStorage 里备好一条「测试任务」，再打开页面
  await navigate();
  await evaluate(`localStorage.setItem('todos', ${JSON.stringify(JSON.stringify(SEED))}); localStorage.removeItem('theme');`);
  await navigate();
  const reloadLoaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.reload');
  await reloadLoaded;
  await sleep(800);
  console.log('【第 1 步】带着已有数据加载一次，写入序列与页面：');
  console.log(JSON.stringify(await evaluate(snapshot), null, 2));

  // 第 2 步：在页面上再添加一条，看写入是否跟着变
  await evaluate('window.__writes = [];');
  await evaluate(`(() => {
    const input = document.querySelector('.todo-input');
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setValue.call(input, '刷新后应该还在');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.todo-add').click();
  })()`);
  await sleep(500);
  console.log('【第 2 步】页面里新增一条后：');
  console.log(JSON.stringify(await evaluate(snapshot), null, 2));

  // 第 3 步：刷新一次
  await evaluate('window.__writes = [];');
  const again = cdp.once('Page.loadEventFired');
  await cdp.send('Page.reload');
  await again;
  await sleep(800);
  console.log('【第 3 步】刷新后：');
  console.log(JSON.stringify(await evaluate(snapshot), null, 2));

  // 第 4 步：切换主题，看 theme 的写入
  await evaluate('window.__writes = []; document.querySelector(".theme-toggle").click();');
  await sleep(400);
  console.log('【第 4 步】点了一次主题切换：');
  console.log(JSON.stringify(await evaluate(snapshot), null, 2));
  cdp.ws.close();
} finally {
  chrome.kill();
}

