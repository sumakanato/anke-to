const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const PASSWORD_FILE = path.join(DATA_DIR, "admin-password.txt");
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

async function ensureLocalPassword() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(PASSWORD_FILE);
  } catch {
    const password = crypto.randomBytes(9).toString("base64url");
    await fs.writeFile(PASSWORD_FILE, `${password}\n`, "utf8");
  }
}

async function getAdminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (process.env.VERCEL) {
    throw Object.assign(new Error("ADMIN_PASSWORD is required on Vercel."), { status: 500 });
  }
  await ensureLocalPassword();
  return (await fs.readFile(PASSWORD_FILE, "utf8")).trim();
}

async function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || (await getAdminPassword());
}

async function createAdminToken() {
  const secret = await getSessionSecret();
  const payload = base64url(
    JSON.stringify({
      sub: "admin",
      exp: Date.now() + SESSION_TTL_MS,
      nonce: crypto.randomBytes(12).toString("base64url"),
    })
  );
  return `${payload}.${sign(payload, secret)}`;
}

function getToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  if (req.headers["x-admin-token"]) return req.headers["x-admin-token"];
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    return url.searchParams.get("token") || "";
  } catch {
    return "";
  }
}

async function isAdmin(req) {
  const token = getToken(req);
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const secret = await getSessionSecret();
  const expected = sign(payload, secret);
  const validSignature =
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!validSignature) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.sub === "admin" && Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

module.exports = {
  createAdminToken,
  getAdminPassword,
  isAdmin,
};
