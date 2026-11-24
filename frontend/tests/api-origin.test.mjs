import test from "node:test";
import assert from "node:assert/strict";

test("la autorización del navegador solo se envía al origen configurado", async () => {
  globalThis.window = {
    location: new URL("https://app.example.test/"),
    SALUDCLICK_API_URL: "https://api.example.test"
  };
  globalThis.document = { addEventListener() {} };
  globalThis.sessionStorage = { getItem: () => "fixture-token" };
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push([url.origin, options.headers.get("Authorization")]);
    return Response.json({ ok: true });
  };
  try {
    const { apiFetch } = await import("../public/js/api.js");
    await assert.rejects(apiFetch("https://other.example.test/api/profile"), /API configurada/);
    await apiFetch("/api/profile");
    assert.deepEqual(requests, [["https://api.example.test", "Bearer fixture-token"]]);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.sessionStorage;
  }
});

test("una respuesta 401 obsoleta conserva la sesion actual", async t => {
  const initialHref = "https://app.example.test/pages/dashboard.html";
  const location = { href: initialHref };
  let token = "old-token";
  const storage = {
    getItem(key) { return key === "saludclick_token" ? token : null; },
    removeItem(key) { if (key === "saludclick_token") token = null; }
  };
  let respond;
  t.mock.method(globalThis, "fetch", () => new Promise(resolve => { respond = resolve; }));
  globalThis.window = { location, SALUDCLICK_API_URL: "https://api.example.test" };
  globalThis.document = { addEventListener() {} };
  globalThis.localStorage = globalThis.sessionStorage = storage;
  try {
    const { apiFetch } = await import("../public/js/api.js");
    const stale = apiFetch("/api/profile");
    token = "new-token";
    respond(Response.json({}, { status: 401 }));
    await assert.rejects(stale, /expir/);
    assert.equal(token, "new-token");
    assert.equal(location.href, initialHref);

    const aborted = new AbortController();
    const pending = apiFetch("/api/profile", { signal: aborted.signal });
    aborted.abort();
    respond(Response.json({}, { status: 401 }));
    await assert.rejects(pending, /expir/);
    assert.equal(token, "new-token");

    const current = apiFetch("/api/profile");
    respond(Response.json({}, { status: 401 }));
    await assert.rejects(current, /expir/);
    assert.equal(token, null);
    assert.equal(location.href, "/login.html");
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.localStorage;
    delete globalThis.sessionStorage;
  }
});
