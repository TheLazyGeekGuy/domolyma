/** In-process request only: browsers strip Origin/Cookie from native Request headers. */
export function internalRequest(
  path: string,
  init: RequestInit,
  profile = "demo-manager",
): Request {
  const headers = new Headers(init.headers);
  headers.set("Origin", "http://localhost");
  headers.set("Cookie", "domolyma_demo=" + profile);
  const request = new Request("http://localhost" + path, init);
  return new Proxy(request, {
    get(target, key) {
      if (key === "headers") return headers;
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
