// Per-device preferences. Storage can be unavailable (private mode, blocked site data), so every call is guarded.
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`centient:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(`centient:${key}`, JSON.stringify(value));
  } catch {
    // ponytail: preference just isn't remembered on this device.
  }
}
