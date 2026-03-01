export type BodyMap = Record<string, unknown>;

export function bodyOf<T = unknown>(res: unknown): T {
  if (typeof res === 'object' && res !== null && 'body' in res) {
    return (res as { body: unknown }).body as unknown as T;
  }
  return res as unknown as T;
}

export function safeErrorStatus(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null) {
    const e = err as { response?: { status?: number }; status?: number };
    return e.response?.status ?? e.status;
  }
  return undefined;
}

export function toAxiosResponse<T>(res: unknown): T | undefined {
  if (typeof res === 'object' && res !== null) {
    return res as T;
  }
  return undefined;
}
