/**
 * 测试环境补丁：让「组件里写的 localStorage」和「测试里读的 localStorage」是同一份可用实现。
 *
 * 背景：Node 25 自带一个实验性的全局 localStorage，会盖住 jsdom 的实现 ——
 * 表现为 window.localStorage 存在，但连 clear() 都没有。直接去摸 Node 那个全局实现，
 * 还会打一条 ExperimentalWarning（复审时看到的警告就是它）。
 *
 * 做法：优先用 jsdom 自己那份 window.localStorage（它完整可用，也不会触发上面的警告），
 * 只有在拿不到 jsdom 实现时才退到全局实现，最后才是内存版兜底。
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

function isUsable(value: unknown): value is Storage {
  return typeof value === 'object' && value !== null && typeof (value as Storage).clear === 'function';
}

// 1) jsdom 自己的实现优先：读 window.localStorage 不会碰 Node 的实验性全局实现。
const fromWindow = typeof window === 'undefined' ? undefined : (window.localStorage as unknown);

let chosen: Storage;
if (isUsable(fromWindow)) {
  chosen = fromWindow;
} else {
  // 2) 退到全局实现：用描述符取值，避免顺带触发 getter 上的实验性警告以外的副作用。
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const fromGlobal = descriptor?.value as unknown;
  chosen = isUsable(fromGlobal) ? fromGlobal : new MemoryStorage();
}

// 3) 把选中的实例同时挂到 globalThis 与 window 上，保证两边读写的是同一份。
if (typeof window !== 'undefined' && (window as unknown as { localStorage: Storage }).localStorage !== chosen) {
  Object.defineProperty(window, 'localStorage', { value: chosen, configurable: true });
}
if ((globalThis as { localStorage?: Storage }).localStorage !== chosen) {
  Object.defineProperty(globalThis, 'localStorage', { value: chosen, configurable: true });
}