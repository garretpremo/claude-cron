import { expect, test, beforeEach, afterEach } from "bun:test";
import { startTestServer, type TestServer } from "../helpers/server";

let s: TestServer;

beforeEach(() => { s = startTestServer(); });
afterEach(() => { s.close(); });

test("GET /api/favorites is empty initially", async () => {
  const r = await fetch(`${s.url}/api/favorites`);
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ favorites: [] });
});

test("PUT /api/favorites/:project sets, GET lists, DELETE unsets", async () => {
  const put = await fetch(`${s.url}/api/favorites/alpha`, { method: "PUT" });
  expect(put.status).toBe(200);
  expect(await put.json()).toEqual({ ok: true });

  const list = await fetch(`${s.url}/api/favorites`);
  expect(await list.json()).toEqual({ favorites: ["alpha"] });

  const del = await fetch(`${s.url}/api/favorites/alpha`, { method: "DELETE" });
  expect(del.status).toBe(200);
  expect(await del.json()).toEqual({ ok: true });

  const list2 = await fetch(`${s.url}/api/favorites`);
  expect(await list2.json()).toEqual({ favorites: [] });
});

test("PUT and DELETE are idempotent", async () => {
  await fetch(`${s.url}/api/favorites/x`, { method: "PUT" });
  await fetch(`${s.url}/api/favorites/x`, { method: "PUT" });
  const list = await fetch(`${s.url}/api/favorites`);
  expect(await list.json()).toEqual({ favorites: ["x"] });

  await fetch(`${s.url}/api/favorites/x`, { method: "DELETE" });
  const del2 = await fetch(`${s.url}/api/favorites/x`, { method: "DELETE" });
  expect(del2.status).toBe(200); // no-op succeeds
});
