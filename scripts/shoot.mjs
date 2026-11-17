// W12 截图脚本：用 Chrome DevTools Protocol 真跑一遍页面，截 light / dark / 刷新后三张图。
// 只做取证，不改项目代码。
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const APP = process.argv[2] ?? 'http://127.0.0.1:5189/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9229;
const OUT_DIR = path.resolve('shots');
const VIEW = { width: 1200, height: 900, scale: 2 };

const TASKS = [
  { id: 1794295660221001, text: '整理第 12 周 Context 笔记', completed: false },
  { id: 1794295660221002, text: '给 ThemeToggle 补一条测试', completed: true },
  { id: 1794295660221003, text: '复习 useEffect 依赖数组', completed: false },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function waitFor(fn, label, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return true;
    await sleep(120);
  }
  throw new Error('等待超时：' + label);
}

const userDataDir = mkdtempSync(path.join(tmpdir(), 'w12-chrome-'));
mkdirSync(OUT_DIR, { recursive: true });

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--force-device-scale-factor=1',
    '--window-size=1200,900',
    '--user-data-dir=' + userDataDir,
    '--remote-debugging-port=' + PORT,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let cdp;
try {
  await waitFor(async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      return r.ok;
    } catch {
      return false;
    }
  }, 'Chrome 调试端口');

  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  cdp = await connect(page.webSocketDebuggerUrl);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: VIEW.width,
    height: VIEW.height,
    deviceScaleFactor: VIEW.scale,
    mobile: false,
  });

  const navigate = async () => {
    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: APP });
    await loaded;
    await waitFor(
      () =>
        cdp
          .send('Runtime.evaluate', {
            expression: "!!document.querySelector('.todo-app')",
            returnByValue: true,
          })
          .then((r) => r.result.value === true),
      'React 挂载',
    );
    await sleep(250);
  };

  const evaluate = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };

  const capture = async (name) => {
    const box = await evaluate(`(() => {
      const section = document.querySelector('.todo-section');
      const rect = section.getBoundingClientRect();
      return { bottom: Math.ceil(rect.bottom + window.scrollY + 28), width: document.documentElement.scrollWidth };
    })()`);
    const clip = {
      x: 0,
      y: 0,
      width: Math.min(VIEW.width, box.width),
      height: box.bottom,
      scale: 1,
    };
    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip,
    });
    const file = path.join(OUT_DIR, name);
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    console.log('已保存', file, JSON.stringify(clip));
    return file;
  };

  await navigate();
  await evaluate(`localStorage.setItem('todos', ${JSON.stringify(JSON.stringify(TASKS))});
                  localStorage.removeItem('theme');`);
  await navigate();

  const count = await evaluate("document.querySelectorAll('.todo-list li').length");
  const theme = await evaluate("document.documentElement.dataset.theme");
  console.log('首屏：列表条数 =', count, '主题 =', theme);
  await capture('shot1-light.png');

  await evaluate("document.querySelector('.theme-toggle').click()");
  await sleep(350);
  console.log('切换后主题 =', await evaluate("document.documentElement.dataset.theme"),
    '按钮 =', await evaluate("document.querySelector('.theme-toggle').textContent"));
  await capture('shot2-dark.png');

  await navigate();
  await sleep(400);
  console.log(
    '刷新后：列表条数 =',
    await evaluate("document.querySelectorAll('.todo-list li').length"),
    '主题 =',
    await evaluate("document.documentElement.dataset.theme"),
    '存储条数 =',
    await evaluate("JSON.parse(localStorage.getItem('todos')).length"),
  );
  await capture('shot3-refresh.png');
} finally {
  try {
    cdp?.ws.close();
  } catch {}
  chrome.kill();
}
