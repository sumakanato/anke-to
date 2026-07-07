const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export function text(data, status = 200, headers = {}) {
  return new Response(data, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...headers,
    },
  });
}

export function handleError(error) {
  const status = error.status || 500;
  if (status === 500) console.error(error);
  return json({ error: status === 500 ? "Server error" : error.message }, status);
}

export function requireMethod(request, allowed) {
  if (!allowed.includes(request.method)) {
    throw Object.assign(new Error("Method not allowed"), { status: 405 });
  }
}

export function requireBinding(env, name) {
  if (!env[name]) {
    throw Object.assign(new Error(`${name} binding is required.`), { status: 500 });
  }
  return env[name];
}

export function sanitizeText(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

export function sanitizeFilename(name) {
  const fallback = "media";
  const fileName = String(name || fallback);
  const dotIndex = fileName.lastIndexOf(".");
  const rawBase = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const rawExt = dotIndex > 0 ? fileName.slice(dotIndex).toLowerCase() : "";
  const base =
    rawBase
      .normalize("NFKC")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || fallback;
  return `${base}${rawExt}`;
}

export function mediaKindFromFilename(filename) {
  const ext = filename.toLowerCase().split(".").pop();
  if (["mp3", "wav", "m4a"].includes(ext)) return "audio";
  if (["mov", "mp4", "webm"].includes(ext)) return "video";
  return "";
}

export function validateRating(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
}

function base64urlFromBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bytesFromBase64url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64urlFromString(value) {
  return base64urlFromBytes(new TextEncoder().encode(value));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64urlFromBytes(new Uint8Array(signature));
}

export async function createAdminToken(env) {
  const secret = env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD;
  if (!secret) throw Object.assign(new Error("ADMIN_PASSWORD is required."), { status: 500 });

  const nonce = crypto.randomUUID();
  const payload = base64urlFromString(
    JSON.stringify({
      sub: "admin",
      exp: Date.now() + SESSION_TTL_MS,
      nonce,
    })
  );
  return `${payload}.${await hmac(payload, secret)}`;
}

function getToken(request) {
  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  const headerToken = request.headers.get("x-admin-token");
  if (headerToken) return headerToken;
  return new URL(request.url).searchParams.get("token") || "";
}

export async function isAdmin(request, env) {
  const token = getToken(request);
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const secret = env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD;
  if (!secret) return false;
  if ((await hmac(payload, secret)) !== signature) return false;

  try {
    const data = JSON.parse(new TextDecoder().decode(bytesFromBase64url(payload)));
    return data.sub === "admin" && Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

export async function requireAdmin(request, env) {
  if (!(await isAdmin(request, env))) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
}

export function normalizeSample(row) {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    url: row.url,
    originalName: row.original_name || "",
    storagePath: row.storage_path || "",
    contentType: row.content_type || "",
    createdAt: row.created_at,
  };
}

export function normalizeResponse(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    evaluator: row.evaluator || "",
    group: row.group_name || "",
    answers: typeof row.answers === "string" ? JSON.parse(row.answers) : row.answers || [],
  };
}

export async function listSamples(env) {
  const db = requireBinding(env, "DB");
  const { results } = await db.prepare("select * from samples order by created_at asc").all();
  return results.map(normalizeSample);
}

export async function listResponses(env) {
  const db = requireBinding(env, "DB");
  const { results } = await db.prepare("select * from responses order by created_at desc").all();
  return results.map(normalizeResponse);
}

export async function createResponse(env, body) {
  const db = requireBinding(env, "DB");
  const samples = await listSamples(env);
  const sampleIds = new Set(samples.map((sample) => sample.id));
  const answers = Array.isArray(body.answers) ? body.answers : [];
  if (!answers.length) throw Object.assign(new Error("No answers submitted."), { status: 400 });

  const cleanAnswers = answers.map((answer) => ({
    sampleId: sanitizeText(answer.sampleId, 80),
    synthesisQuality: validateRating(answer.synthesisQuality),
    timbreAccuracy: validateRating(answer.timbreAccuracy),
    comment: sanitizeText(answer.comment, 500),
  }));

  const invalid = cleanAnswers.some(
    (answer) =>
      !sampleIds.has(answer.sampleId) ||
      answer.synthesisQuality === null ||
      answer.timbreAccuracy === null
  );
  if (invalid) throw Object.assign(new Error("Answers are incomplete."), { status: 400 });

  await db
    .prepare(
      "insert into responses (id, created_at, evaluator, group_name, answers) values (?, ?, ?, ?, ?)"
    )
    .bind(
      crypto.randomUUID(),
      new Date().toISOString(),
      sanitizeText(body.evaluator, 80),
      sanitizeText(body.group, 80),
      JSON.stringify(cleanAnswers)
    )
    .run();
}

export async function createSample(env, formData) {
  const db = requireBinding(env, "DB");
  const bucket = requireBinding(env, "MEDIA_BUCKET");
  const media = formData.get("media");
  if (!(media instanceof File) || !media.size) {
    throw Object.assign(new Error("Media file is required."), { status: 400 });
  }

  const cleanName = sanitizeFilename(media.name);
  const kind = mediaKindFromFilename(cleanName);
  if (!kind) throw Object.assign(new Error("Unsupported media type."), { status: 400 });

  const storedName = `${Date.now()}-${crypto.randomUUID()}-${cleanName}`;
  const storagePath = `samples/${storedName}`;
  const url = `/media/${storagePath}`;
  const title = sanitizeText(formData.get("title"), 120) || cleanName.replace(/\.[^.]+$/, "");
  const createdAt = new Date().toISOString();

  await bucket.put(storagePath, media.stream(), {
    httpMetadata: {
      contentType: media.type || "application/octet-stream",
    },
  });

  const sample = {
    id: crypto.randomUUID(),
    title,
    kind,
    url,
    originalName: cleanName,
    storagePath,
    contentType: media.type || "application/octet-stream",
    createdAt,
  };

  await db
    .prepare(
      "insert into samples (id, title, kind, url, original_name, storage_path, content_type, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      sample.id,
      sample.title,
      sample.kind,
      sample.url,
      sample.originalName,
      sample.storagePath,
      sample.contentType,
      sample.createdAt
    )
    .run();

  return sample;
}

export async function deleteSample(env, id) {
  const db = requireBinding(env, "DB");
  const bucket = requireBinding(env, "MEDIA_BUCKET");
  const sample = await db.prepare("select * from samples where id = ?").bind(id).first();
  if (!sample) throw Object.assign(new Error("Not found"), { status: 404 });

  await db.prepare("delete from samples where id = ?").bind(id).run();
  if (sample.storage_path) await bucket.delete(sample.storage_path);
}

export function responsesToCsv(samples, responses) {
  const names = new Map(samples.map((sample) => [sample.id, sample.title]));
  const rows = [
    [
      "response_id",
      "created_at",
      "evaluator",
      "group",
      "sample_id",
      "sample_title",
      "synthesis_quality",
      "timbre_accuracy",
      "comment",
    ],
  ];

  for (const response of responses) {
    for (const answer of response.answers || []) {
      rows.push([
        response.id,
        response.createdAt,
        response.evaluator,
        response.group,
        answer.sampleId,
        names.get(answer.sampleId) || "",
        answer.synthesisQuality,
        answer.timbreAccuracy,
        answer.comment || "",
      ]);
    }
  }

  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(",")
    )
    .join("\n");
}
