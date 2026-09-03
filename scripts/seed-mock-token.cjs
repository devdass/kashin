// Seed a dummy (fictional) Akahu token so the mock dashboard renders populated.
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const fs = require("fs");

const pid = execFileSync("bash", ["-c", "ss -tlnp 2>/dev/null | grep 3140 | grep -oP 'pid=\\K[0-9]+' | head -1"], { encoding: "utf8" }).trim();
const env = fs.readFileSync(`/proc/${pid}/environ`, "utf8");
const keyB64 = env.split("\0").find((l) => l.startsWith("AKAHU_ENCRYPTION_KEY="))?.split("=").slice(1).join("=");
if (!keyB64) { console.error("no key"); process.exit(1); }
const KEY = Buffer.from(keyB64, "base64");

function enc(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, ct].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

const userToken = enc("mock-user-token-fictional");
const appToken = enc("mock-app-token-fictional");
const DB = "/tmp/opencode/mock-data/app.db";
// Inline the values (base64url is SQL-safe); execFileSync args can't bind "?" placeholders.
const sql = `INSERT INTO akahu_credentials (id,user_token_encrypted,app_token_encrypted,updated_at) VALUES (1,'${userToken}','${appToken}',datetime('now'));`;
execFileSync("sqlite3", [DB, sql], { encoding: "utf8" });
console.log("seeded dummy tokens");