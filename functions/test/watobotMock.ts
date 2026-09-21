import {vi} from "vitest";

// Stands in for Watobot across every test. Routes are matched on pathname
// alone (ignoring WATOBOT_API_BASE, which we never bother setting in tests)
// so the same mock works whether a call comes from the Functions-side
// watobotClient or from code here that mimics the client-side watobotFetch.
export type WatobotHandler = (url: URL, init?: RequestInit) => unknown;

const WATOBOT_HOST = "watobot.test";

export function installWatobotMock() {
  const handlers = new Map<string, WatobotHandler>();
  const calls: {method: string; pathname: string; body?: unknown}[] = [];
  const realFetch = globalThis.fetch;

  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    // Only intercept calls aimed at Watobot — initializeTestEnvironment and
    // the rules-unit-testing SDK make their own real fetch calls (emulator
    // discovery, RPCs) that must pass through untouched.
    if (url.hostname !== WATOBOT_HOST) {
      return realFetch(input, init);
    }
    calls.push({
      method: init?.method ?? "GET",
      pathname: url.pathname + url.search,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    const key = `${init?.method ?? "GET"} ${url.pathname}`;
    const handler = handlers.get(key);
    if (!handler) {
      throw new Error(`No Watobot mock registered for ${key}`);
    }
    const body = await handler(url, init);
    return new Response(JSON.stringify(body), {status: 200});
  });

  return {
    calls,
    install() {
      vi.stubGlobal("fetch", fetchMock);
    },
    on(method: string, pathname: string, handler: WatobotHandler) {
      handlers.set(`${method} ${pathname}`, handler);
    },
  };
}

export {WATOBOT_HOST};
