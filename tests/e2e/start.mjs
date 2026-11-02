// Local stand-in for Supabase, for end-to-end testing only.
//   Postgres (real) + PostgREST (real, same engine Supabase uses for /rest/v1)
//   + a small gateway imitating Supabase Auth (email links, sessions) and Storage.
// Sign-in "emails" are written to ./mailbox.log instead of being sent.
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import jwt from "jsonwebtoken";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const APP = process.argv[2] ?? path.resolve(HERE, "../..");
const SECRET = "local-test-jwt-secret-at-least-32-characters";
const PUBLISHABLE = "sb_publishable_localtest";
const SERVER_KEY = "sb_secret_localtest"; // stands in for the Supabase secret key (server only)
const PG_PORT = 54322, REST_PORT = 54323, GW_PORT = 54321;
const RUN = path.join(HERE, ".run"); fs.mkdirSync(RUN, { recursive: true });
const FILES = path.join(RUN, "storage-files");
const MAILBOX = path.join(RUN, "mailbox.log");
const fresh = process.argv.includes("--fresh");

const dataDir = path.join(RUN, "pgdata");
if (fresh) fs.rmSync(dataDir, { recursive: true, force: true });
const firstRun = !fs.existsSync(dataDir);

const pgServer = new EmbeddedPostgres({
  databaseDir: dataDir, user: "postgres", password: "postgres", port: PG_PORT, persistent: true,
  createPostgresUser: true, initdbFlags: ["--lc-messages=C", "--locale=C", "--encoding=UTF8"], onLog: (m) => process.env.PGLOG && console.log("[pglog]", String(m)), onError: (e) => console.error("[pg]", String(e)),
});
if (firstRun) await pgServer.initialise();
await pgServer.start();
const db = new pg.Pool({ host: "localhost", port: PG_PORT, user: "postgres", password: "postgres", database: "postgres" });

if (firstRun) {
  const run = async (f) => { await db.query(fs.readFileSync(f, "utf8")); console.log("  applied", path.relative(APP, f) || f); };
  await run(path.join(HERE, "bootstrap.sql"));
  for (const f of fs.readdirSync(path.join(APP, "supabase/migrations")).sort()) await run(path.join(APP, "supabase/migrations", f));
  await run(path.join(APP, "supabase/seed.sql"));
  if (process.argv.includes("--samples")) await run(path.join(APP, "supabase/optional-sample-products.sql"));
}

// ---------------------------------------------------------------- PostgREST
fs.writeFileSync(path.join(RUN, "postgrest.conf"), `
db-uri = "postgres://authenticator:authpass@localhost:${PG_PORT}/postgres"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "${SECRET}"
server-port = ${REST_PORT}
db-pool = 10
`);
const rest = spawn(process.env.POSTGREST_BIN ?? path.join(HERE, ".run", "postgrest"), [path.join(RUN, "postgrest.conf")], { stdio: ["ignore", "ignore", "inherit"] });
await new Promise((r) => setTimeout(r, 1500));

// ---------------------------------------------------------------- Auth + Storage gateway
const pkce = new Map(); // auth_code -> { userId, challenge }
const refresh = new Map(); // refresh_token -> userId

async function userRow(id) {
  const { rows } = await db.query("select id, email, created_at from auth.users where id = $1", [id]);
  return rows[0] && { id: rows[0].id, aud: "authenticated", role: "authenticated", email: rows[0].email,
    app_metadata: { provider: "email" }, user_metadata: {}, created_at: rows[0].created_at };
}
async function session(userId) {
  const now = Math.floor(Date.now() / 1000);
  const user = await userRow(userId);
  // Like Supabase: the access token carries the user's email and metadata.
  const access_token = jwt.sign({ sub: userId, role: "authenticated", aud: "authenticated", email: user?.email,
    app_metadata: { provider: "email" }, user_metadata: {}, iat: now, exp: now + 3600 }, SECRET);
  const refresh_token = crypto.randomBytes(16).toString("hex");
  refresh.set(refresh_token, userId);
  return { access_token, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token, user };
}
function bearerUser(req) {
  const t = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  try { return jwt.verify(t, SECRET).sub; } catch { return null; }
}
const body = (req) => new Promise((res) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => res(Buffer.concat(c))); });
const json = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };

/** Run a storage.objects statement as the caller, so the real RLS policies decide. */
async function asUser(userId, q, params) {
  const c = await db.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${userId ? "authenticated" : "anon"}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId ?? "", role: userId ? "authenticated" : "anon" })]);
    const r = await c.query(q, params);
    await c.query("commit");
    return r;
  } catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${GW_PORT}`);
  if (process.env.LOG_REQ) fs.appendFileSync(path.join(RUN, "req.log"), `${Date.now()} ${req.method} ${url.pathname}${url.search.slice(0, 80)}\n`);
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "*");
  res.setHeader("access-control-allow-methods", "*");
  if (req.method === "OPTIONS") return res.end();
  try {
    // ---- REST → PostgREST (publishable key = anonymous; user JWT passes through)
    if (url.pathname.startsWith("/rest/v1/")) {
      const headers = { ...req.headers, host: `localhost:${REST_PORT}` };
      if (req.headers.apikey === SERVER_KEY) {
        // Like Supabase: the secret key acts as service_role (bypasses RLS).
        headers.authorization = "Bearer " + jwt.sign({ role: "service_role" }, SECRET, { expiresIn: 3600 });
      } else if (!bearerUser(req)) delete headers.authorization;
      delete headers.apikey;
      const payload = await body(req);
      const up = http.request({ host: "localhost", port: REST_PORT, path: url.pathname.slice(8) + url.search, method: req.method, headers }, (r) => {
        res.writeHead(r.statusCode, r.headers); r.pipe(res);
      });
      up.on("error", (e) => json(res, 502, { message: String(e) }));
      return up.end(payload);
    }
    // ---- Pretend Razorpay orders API (tests only): checks the key pair, records the order.
    if (url.pathname === "/razorpay/v1/orders" && req.method === "POST") {
      const auth = Buffer.from((req.headers.authorization ?? "").replace(/^Basic /, ""), "base64").toString();
      if (auth !== "rzp_test_local:local_test_secret") return json(res, 401, { error: { description: "Authentication failed" } });
      const b = JSON.parse((await body(req)).toString() || "{}");
      if (process.env.RZP_FAIL === "1" || fs.existsSync(path.join(RUN, "rzp-fail"))) return json(res, 500, { error: { description: "Server error" } });
      const id = "order_" + crypto.randomBytes(7).toString("hex");
      fs.appendFileSync(path.join(RUN, "razorpay.log"), JSON.stringify({ id, amount: b.amount, receipt: b.receipt }) + "\n");
      return json(res, 200, { id, amount: b.amount, currency: b.currency, receipt: b.receipt, status: "created" });
    }
    const refund = url.pathname.match(/^\/razorpay\/v1\/payments\/([^/]+)\/refund$/);
    if (refund && req.method === "POST") {
      const auth = Buffer.from((req.headers.authorization ?? "").replace(/^Basic /, ""), "base64").toString();
      if (auth !== "rzp_test_local:local_test_secret") return json(res, 401, { error: { description: "Authentication failed" } });
      const b = JSON.parse((await body(req)).toString() || "{}");
      const id = "rfnd_" + crypto.randomBytes(7).toString("hex");
      fs.appendFileSync(path.join(RUN, "razorpay.log"), JSON.stringify({ refund: id, payment: refund[1], amount: b.amount }) + "\n");
      return json(res, 200, { id, amount: b.amount, payment_id: refund[1], status: "processed" });
    }
    // ---- Pretend email service (Resend-compatible): writes each email to emails.log
    if (url.pathname === "/email/emails" && req.method === "POST") {
      if (req.headers.authorization !== "Bearer re_test_local") return json(res, 401, { message: "bad key" });
      const b = JSON.parse((await body(req)).toString() || "{}");
      fs.appendFileSync(path.join(RUN, "emails.log"), JSON.stringify({ to: b.to, subject: b.subject, from: b.from, html: b.html }) + "\n");
      return json(res, 200, { id: crypto.randomUUID() });
    }
    // ---- Auth
    if (url.pathname === "/auth/v1/otp" && req.method === "POST") {
      const b = JSON.parse((await body(req)).toString() || "{}");
      const email = String(b.email).toLowerCase();
      const { rows } = await db.query("insert into auth.users (email) values ($1) on conflict (email) do update set email = excluded.email returning id", [email]);
      const code = crypto.randomUUID();
      pkce.set(code, { userId: rows[0].id, challenge: b.code_challenge });
      const link = `${url.searchParams.get("redirect_to")}${url.searchParams.get("redirect_to")?.includes("?") ? "&" : "?"}code=${code}`;
      fs.appendFileSync(MAILBOX, `${new Date().toISOString()} TO ${email} LINK ${link}\n`);
      return json(res, 200, {});
    }
    if (url.pathname === "/auth/v1/token") {
      const b = JSON.parse((await body(req)).toString() || "{}");
      if (url.searchParams.get("grant_type") === "pkce") {
        const entry = pkce.get(b.auth_code);
        const ok = entry && (!entry.challenge || crypto.createHash("sha256").update(b.code_verifier ?? "").digest("base64url") === entry.challenge);
        if (!ok) return json(res, 400, { error: "invalid_grant", error_description: "Invalid code", code: "bad_code_verifier" });
        pkce.delete(b.auth_code);
        return json(res, 200, await session(entry.userId));
      }
      if (url.searchParams.get("grant_type") === "refresh_token") {
        const uid = refresh.get(b.refresh_token);
        if (!uid) return json(res, 400, { error: "invalid_grant", code: "refresh_token_not_found" });
        return json(res, 200, await session(uid));
      }
    }
    if (url.pathname === "/auth/v1/user" && req.method === "GET") {
      const uid = bearerUser(req);
      const u = uid && (await userRow(uid));
      return u ? json(res, 200, u) : json(res, 401, { code: 401, msg: "invalid JWT" });
    }
    if (url.pathname === "/auth/v1/logout") return res.writeHead(204).end();
    // ---- Storage
    const pub = url.pathname.match(/^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (pub && req.method === "GET") {
      const file = path.join(FILES, pub[1], decodeURIComponent(pub[2]));
      if (!file.startsWith(FILES) || !fs.existsSync(file)) return json(res, 404, { message: "not found" });
      res.writeHead(200, { "content-type": fs.readFileSync(file + ".type", "utf8") });
      return res.end(fs.readFileSync(file));
    }
    const up = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
    if (up && (req.method === "POST" || req.method === "PUT")) {
      const [bucket, name] = [up[1], decodeURIComponent(up[2])];
      const data = await body(req);
      const type = req.headers["content-type"] ?? "application/octet-stream";
      const { rows: [b] } = await db.query("select * from storage.buckets where id = $1", [bucket]);
      if (!b) return json(res, 404, { statusCode: "404", error: "Bucket not found", message: "Bucket not found" });
      if (b.file_size_limit && data.length > Number(b.file_size_limit)) return json(res, 413, { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" });
      if (b.allowed_mime_types && !b.allowed_mime_types.includes(type)) return json(res, 415, { statusCode: "415", error: "invalid_mime_type", message: `mime type ${type} is not supported` });
      try {
        await asUser(bearerUser(req), "insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, name]);
      } catch (e) {
        return json(res, 403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
      }
      const file = path.join(FILES, bucket, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, data); fs.writeFileSync(file + ".type", type);
      return json(res, 200, { Key: `${bucket}/${name}`, Id: crypto.randomUUID() });
    }
    const del = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)$/);
    if (del && req.method === "DELETE") {
      const { prefixes = [] } = JSON.parse((await body(req)).toString() || "{}");
      const r = await asUser(bearerUser(req), "delete from storage.objects where bucket_id = $1 and name = any($2) returning name", [del[1], prefixes]);
      for (const row of r.rows) fs.rmSync(path.join(FILES, del[1], row.name), { force: true });
      return json(res, 200, r.rows.map((x) => ({ name: x.name })));
    }
    json(res, 404, { message: `gateway: no route for ${req.method} ${url.pathname}` });
  } catch (e) {
    console.error("[gateway]", e);
    json(res, 500, { message: String(e.message ?? e) });
  }
});
server.listen(GW_PORT, () => {
  console.log(`local supabase ready: http://localhost:${GW_PORT}  key=${PUBLISHABLE}  (mailbox: ${MAILBOX})`);
});

const stop = async () => { rest.kill(); server.close(); await db.end(); await pgServer.stop(); process.exit(0); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
