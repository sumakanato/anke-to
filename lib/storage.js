const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const PUBLIC_DIR = path.join(ROOT, "public");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads");
const RESPONSES_FILE = path.join(DATA_DIR, "responses.json");
const SAMPLES_FILE = path.join(DATA_DIR, "samples.json");

function useSupabase() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function requireConfiguredStorage() {
  if (useSupabase()) return;
  if (process.env.VERCEL) {
    throw Object.assign(new Error("Supabase environment variables are required on Vercel."), {
      status: 500,
    });
  }
}

async function ensureJson(file, fallback) {
  try {
    JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(fallback, null, 2), "utf8");
  }
}

async function ensureLocalStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await ensureJson(RESPONSES_FILE, []);
  await ensureJson(SAMPLES_FILE, []);
}

async function readJson(file, fallback) {
  await ensureLocalStorage();
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await ensureLocalStorage();
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

function sanitizeText(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

function sanitizeFilename(name) {
  const parsed = path.parse(name || "media");
  const base =
    parsed.name
      .normalize("NFKC")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "media";
  return `${base}${parsed.ext.toLowerCase()}`;
}

function mediaKindFromExt(ext) {
  if ([".mp3", ".wav", ".m4a"].includes(ext)) return "audio";
  if ([".mov", ".mp4", ".webm"].includes(ext)) return "video";
  return "";
}

function validateRating(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
}

function normalizeSample(row) {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    url: row.url,
    originalName: row.original_name || row.originalName || "",
    storagePath: row.storage_path || row.storagePath || "",
    createdAt: row.created_at || row.createdAt,
  };
}

function normalizeResponse(row) {
  return {
    id: row.id,
    createdAt: row.created_at || row.createdAt,
    evaluator: row.evaluator || "",
    group: row.group_name || row.group || "",
    answers: row.answers || [],
  };
}

function supabaseBase() {
  return process.env.SUPABASE_URL.replace(/\/$/, "");
}

async function supabaseFetch(url, options = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw Object.assign(new Error(message || response.statusText), { status: 500 });
  }
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : response.text();
}

async function supabaseRest(pathname, options = {}) {
  return supabaseFetch(`${supabaseBase()}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
}

async function listSamples() {
  requireConfiguredStorage();
  if (useSupabase()) {
    const rows = await supabaseRest("samples?select=*&order=created_at.asc");
    return rows.map(normalizeSample);
  }
  return (await readJson(SAMPLES_FILE, [])).map(normalizeSample);
}

async function listResponses() {
  requireConfiguredStorage();
  if (useSupabase()) {
    const rows = await supabaseRest("responses?select=*&order=created_at.desc");
    return rows.map(normalizeResponse);
  }
  return (await readJson(RESPONSES_FILE, [])).map(normalizeResponse);
}

async function createSample({ title, file }) {
  requireConfiguredStorage();
  const cleanName = sanitizeFilename(file.filename);
  const ext = path.extname(cleanName);
  const kind = mediaKindFromExt(ext);
  if (!kind) throw Object.assign(new Error("Unsupported media type."), { status: 400 });

  const id = crypto.randomUUID();
  const storedName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${cleanName}`;
  const sampleTitle = sanitizeText(title, 120) || path.parse(cleanName).name;
  const createdAt = new Date().toISOString();

  if (useSupabase()) {
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "survey-media";
    const storagePath = `samples/${storedName}`;
    await supabaseFetch(`${supabaseBase()}/storage/v1/object/${bucket}/${storagePath}`, {
      method: "POST",
      body: file.data,
      headers: {
        "cache-control": "3600",
        "content-type": file.contentType,
        "x-upsert": "false",
      },
    });
    const publicUrl = `${supabaseBase()}/storage/v1/object/public/${bucket}/${storagePath}`;
    const [row] = await supabaseRest("samples", {
      method: "POST",
      body: JSON.stringify({
        id,
        title: sampleTitle,
        kind,
        url: publicUrl,
        original_name: cleanName,
        storage_path: storagePath,
        created_at: createdAt,
      }),
      headers: { prefer: "return=representation" },
    });
    return normalizeSample(row);
  }

  await ensureLocalStorage();
  await fs.writeFile(path.join(UPLOAD_DIR, storedName), file.data);
  const samples = await readJson(SAMPLES_FILE, []);
  const sample = {
    id,
    title: sampleTitle,
    kind,
    url: `/uploads/${storedName}`,
    originalName: cleanName,
    storagePath: storedName,
    createdAt,
  };
  samples.push(sample);
  await writeJson(SAMPLES_FILE, samples);
  return sample;
}

async function deleteSample(id) {
  requireConfiguredStorage();
  if (useSupabase()) {
    const rows = await supabaseRest(`samples?id=eq.${encodeURIComponent(id)}&select=*`);
    const sample = rows[0];
    if (!sample) throw Object.assign(new Error("Not found"), { status: 404 });
    await supabaseRest(`samples?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    if (sample.storage_path) {
      const bucket = process.env.SUPABASE_STORAGE_BUCKET || "survey-media";
      await supabaseFetch(`${supabaseBase()}/storage/v1/object/${bucket}`, {
        method: "DELETE",
        body: JSON.stringify({ prefixes: [sample.storage_path] }),
        headers: { "content-type": "application/json" },
      }).catch(() => {});
    }
    return;
  }

  const samples = await readJson(SAMPLES_FILE, []);
  const sample = samples.find((item) => item.id === id);
  if (!sample) throw Object.assign(new Error("Not found"), { status: 404 });
  await writeJson(
    SAMPLES_FILE,
    samples.filter((item) => item.id !== id)
  );
  if (sample.url?.startsWith("/uploads/")) {
    await fs.rm(path.join(PUBLIC_DIR, sample.url), { force: true });
  }
}

async function createResponse(body) {
  requireConfiguredStorage();
  const samples = await listSamples();
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

  const response = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    evaluator: sanitizeText(body.evaluator, 80),
    group: sanitizeText(body.group, 80),
    answers: cleanAnswers,
  };

  if (useSupabase()) {
    await supabaseRest("responses", {
      method: "POST",
      body: JSON.stringify({
        id: response.id,
        created_at: response.createdAt,
        evaluator: response.evaluator,
        group_name: response.group,
        answers: response.answers,
      }),
    });
    return response;
  }

  const responses = await readJson(RESPONSES_FILE, []);
  responses.push(response);
  await writeJson(RESPONSES_FILE, responses);
  return response;
}

function responsesToCsv(samples, responses) {
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
          const text = String(cell ?? "");
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(",")
    )
    .join("\n");
}

module.exports = {
  createResponse,
  createSample,
  deleteSample,
  ensureLocalStorage,
  listResponses,
  listSamples,
  responsesToCsv,
  sanitizeText,
};
