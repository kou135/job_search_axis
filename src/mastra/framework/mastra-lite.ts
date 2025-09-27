export type Ctx = { log: (...args: unknown[]) => void };

export interface Agent<I, O> {
  name: string;
  run(input: I, ctx: Ctx): Promise<O>;
}

export function defineAgent<I, O>(
  name: string,
  run: (input: I, ctx: Ctx) => Promise<O>
): Agent<I, O> {
  return { name, run };
}

export type EventMap = Record<string, unknown>;

export class LocalBus<M extends EventMap> {
  private handlers = new Map<keyof M, ((payload: M[keyof M]) => Promise<void>)[]>();

  on<K extends keyof M>(type: K, handler: (payload: M[K]) => Promise<void>) {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as (payload: M[keyof M]) => Promise<void>);
    this.handlers.set(type, list);
  }

  async emit<K extends keyof M>(type: K, payload: M[K]) {
    const list = this.handlers.get(type) ?? [];
    for (const handler of list) {
      await handler(payload as M[keyof M]);
    }
  }
}
