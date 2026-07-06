const { createAdminToken, getAdminPassword, isAdmin } = require("./auth");
const { collectBody, handleError, parseMultipart, readJsonBody, sendJson } = require("./http");
const {
  createResponse,
  createSample,
  deleteSample,
  listResponses,
  listSamples,
  responsesToCsv,
} = require("./storage");

function method(req) {
  return String(req.method || "GET").toUpperCase();
}

function requireMethod(req, allowed) {
  if (!allowed.includes(method(req))) {
    throw Object.assign(new Error("Method not allowed"), { status: 405 });
  }
}

async function requireAdmin(req) {
  if (!(await isAdmin(req))) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
}

async function samplesHandler(req, res) {
  try {
    requireMethod(req, ["GET"]);
    sendJson(res, 200, await listSamples());
  } catch (error) {
    handleError(res, error);
  }
}

async function submitResponseHandler(req, res) {
  try {
    requireMethod(req, ["POST"]);
    const body = await readJsonBody(req);
    await createResponse(body);
    sendJson(res, 201, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}

async function loginHandler(req, res) {
  try {
    requireMethod(req, ["POST"]);
    const body = await readJsonBody(req);
    const expected = await getAdminPassword();
    if (body.password !== expected) {
      throw Object.assign(new Error("Invalid password"), { status: 401 });
    }
    sendJson(res, 200, { token: await createAdminToken() });
  } catch (error) {
    handleError(res, error);
  }
}

async function adminResponsesHandler(req, res) {
  try {
    requireMethod(req, ["GET"]);
    await requireAdmin(req);
    sendJson(res, 200, {
      samples: await listSamples(),
      responses: await listResponses(),
    });
  } catch (error) {
    handleError(res, error);
  }
}

async function adminResponsesCsvHandler(req, res) {
  try {
    requireMethod(req, ["GET"]);
    await requireAdmin(req);
    const csv = responsesToCsv(await listSamples(), await listResponses());
    res.writeHead(200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="survey-results.csv"',
    });
    res.end(csv);
  } catch (error) {
    handleError(res, error);
  }
}

async function adminSamplesHandler(req, res) {
  try {
    requireMethod(req, ["POST"]);
    await requireAdmin(req);

    const buffer = await collectBody(req);
    const parts = parseMultipart(buffer, req.headers["content-type"]);
    const fields = new Map();
    for (const part of parts) {
      if (!part.filename) fields.set(part.name, part.data.toString("utf8"));
    }
    const file = parts.find((part) => part.name === "media" && part.filename && part.data.length);
    if (!file) throw Object.assign(new Error("Media file is required."), { status: 400 });

    sendJson(res, 201, await createSample({ title: fields.get("title"), file }));
  } catch (error) {
    handleError(res, error);
  }
}

function sampleIdFromRequest(req) {
  if (req.query?.id) return Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const url = new URL(req.url, `http://${req.headers.host}`);
  return decodeURIComponent(url.pathname.split("/").pop() || "");
}

async function adminSampleByIdHandler(req, res) {
  try {
    requireMethod(req, ["DELETE"]);
    await requireAdmin(req);
    await deleteSample(sampleIdFromRequest(req));
    sendJson(res, 200, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}

module.exports = {
  adminResponsesCsvHandler,
  adminResponsesHandler,
  adminSampleByIdHandler,
  adminSamplesHandler,
  loginHandler,
  samplesHandler,
  submitResponseHandler,
};
