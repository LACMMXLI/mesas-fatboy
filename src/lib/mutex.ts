type Lock = { tail: Promise<void> };
const root = globalThis as typeof globalThis & { __fatboyWriteLock?: Lock };
const lock = root.__fatboyWriteLock ??= { tail: Promise.resolve() };

// ponytail: one server-process write queue; per-branch locks if traffic makes this a bottleneck.
export function serializeWrites<T>(work: () => Promise<T>): Promise<T> {
  const current = lock.tail.then(work, work);
  lock.tail = current.then(() => undefined, () => undefined);
  return current;
}
