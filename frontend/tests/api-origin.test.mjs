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
