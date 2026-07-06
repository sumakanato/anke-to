const MAX_BODY_BYTES = 300 * 1024 * 1024;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, message, headers = {}) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", ...headers });
  res.end(message);
}

async function collectBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  if (req.body && typeof req.body === "object") return Buffer.from(JSON.stringify(req.body));

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw Object.assign(new Error("Request body is too large."), { status: 413 });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const body = await collectBody(req);
  if (!body.length) return {};
  return JSON.parse(body.toString("utf8"));
}

function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!match) throw Object.assign(new Error("Missing multipart boundary."), { status: 400 });
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const parts = [];
  let start = buffer.indexOf(boundary);

  while (start !== -1) {
    start += boundary.length;
    if (buffer[start] === 45 && buffer[start + 1] === 45) break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;

    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), start);
    if (headerEnd === -1) break;

    const rawHeaders = buffer.slice(start, headerEnd).toString("utf8");
    const next = buffer.indexOf(boundary, headerEnd + 4);
    if (next === -1) break;

    let contentEnd = next;
    if (buffer[contentEnd - 2] === 13 && buffer[contentEnd - 1] === 10) contentEnd -= 2;

    const headers = Object.fromEntries(
      rawHeaders.split("\r\n").map((line) => {
        const index = line.indexOf(":");
        return [line.slice(0, index).toLowerCase(), line.slice(index + 1).trim()];
      })
    );
    const disposition = headers["content-disposition"] || "";
    const name = /name="([^"]+)"/.exec(disposition)?.[1] || "";
    const filename = /filename="([^"]*)"/.exec(disposition)?.[1] || "";
    parts.push({
      name,
      filename,
      contentType: headers["content-type"] || "application/octet-stream",
      data: buffer.slice(headerEnd + 4, contentEnd),
    });
    start = next;
  }

  return parts;
}

function handleError(res, error) {
  const status = error.status || 500;
  sendJson(res, status, { error: status === 500 ? "Server error" : error.message });
  if (status === 500) console.error(error);
}

module.exports = {
  collectBody,
  handleError,
  parseMultipart,
  readJsonBody,
  sendJson,
  sendText,
};
