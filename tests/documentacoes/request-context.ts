import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";

// Next initializes its stores using the global supplied by its normal server runtime.
Object.assign(globalThis, { AsyncLocalStorage });
const runtimeRequire = createRequire(import.meta.url);
const { workAsyncStorage } = runtimeRequire("next/dist/server/app-render/work-async-storage.external") as typeof import("next/dist/server/app-render/work-async-storage.external");
const { workUnitAsyncStorage } = runtimeRequire("next/dist/server/app-render/work-unit-async-storage.external") as typeof import("next/dist/server/app-render/work-unit-async-storage.external");
const { RequestCookies } = runtimeRequire("next/dist/server/web/spec-extension/cookies") as typeof import("next/dist/server/web/spec-extension/cookies");

/** Real Next cookie context, synthetic users/Prisma mocks: never touches a database. */
export function requestContext<T>(token: string | undefined, run: () => T): T {
  const headers = new Headers(token ? { cookie: `flyimob_session=${token}` } : {});
  const cookies = new RequestCookies(headers);
  return workAsyncStorage.run({ route: "/synthetic-test" } as never, () =>
    workUnitAsyncStorage.run({ type: "request", phase: "render", cookies } as never, run));
}
