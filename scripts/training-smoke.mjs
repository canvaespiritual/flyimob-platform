import assert from "node:assert/strict";
const origin = new URL(process.argv[2] ?? "http://localhost:3105");
assert.ok(["localhost", "127.0.0.1"].includes(origin.hostname), "Smoke permitido somente em localhost");
for (const [path, status, mime] of [
  ["/corretor.webmanifest", 200, "application/manifest+json"],
  ["/corretor-sw.js", 200, "javascript"],
  ["/corretor-offline.html", 200, "text/html"],
  ["/academy-admin/icon-192.png", 200, "image/png"],
  ["/academy-admin/icon-512.png", 200, "image/png"],
  ["/academy-admin/icon-maskable.png", 200, "image/png"],
  ["/api/training/courses", 401],
  ["/api/admin/training/access", 401],
  ["/admin/treinamentos", 307],
  ["/admin/treinamentos/acessos", 307],
  ["/documentacoes", 307],
]) {
  const r = await fetch(new URL(path, origin), { redirect: "manual" });
  assert.equal(r.status, status, path);
  if (mime) assert.ok(r.headers.get("content-type")?.includes(mime), `${path}: MIME`);
  if (path.startsWith("/api/")) assert.equal(r.headers.get("cache-control"), "private, no-store");
  console.log(`${r.status} ${path}`);
}
for (const [path, method] of [["/api/training/lessons/synthetic/playback", "POST"], ["/api/training/lessons/synthetic/progress", "POST"], ["/api/admin/training/access", "PUT"]]) {
  const r = await fetch(new URL(path, origin), { method, redirect: "manual" });
  assert.equal(r.status, 401, path); console.log(`${r.status} ${method} ${path}`);
}
console.log("14 verificações HTTP locais passaram; nenhuma sessão ou escrita de dados.");
