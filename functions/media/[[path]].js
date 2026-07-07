import { handleError, requireBinding } from "../_utils.js";

export async function onRequestGet({ request, env, params }) {
  try {
    const bucket = requireBinding(env, "MEDIA_BUCKET");
    const key = Array.isArray(params.path) ? params.path.join("/") : params.path;
    if (!key) return new Response("Not found", { status: 404 });

    const rangeHeader = request.headers.get("range");
    const head = rangeHeader ? await bucket.head(key) : null;
    if (rangeHeader && !head) return new Response("Not found", { status: 404 });

    const range = rangeHeader && head ? parseRange(rangeHeader, head.size) : null;
    const object = range
      ? await bucket.get(key, { range: { offset: range.start, length: range.end - range.start + 1 } })
      : await bucket.get(key);
    if (!object) return new Response("Not found", { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "public, max-age=3600");
    headers.set("accept-ranges", "bytes");
    if (range && head) {
      headers.set("content-range", `bytes ${range.start}-${range.end}/${head.size}`);
      headers.set("content-length", String(range.end - range.start + 1));
      return new Response(object.body, { status: 206, headers });
    }
    if (object.size) headers.set("content-length", String(object.size));
    return new Response(object.body, { headers });
  } catch (error) {
    return handleError(error);
  }
}

function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header || "");
  if (!match) return null;

  let start = match[1] === "" ? null : Number(match[1]);
  let end = match[2] === "" ? null : Number(match[2]);
  if (start === null && end === null) return null;

  if (start === null) {
    const suffixLength = Math.min(end, size);
    start = size - suffixLength;
    end = size - 1;
  } else {
    end = end === null ? size - 1 : Math.min(end, size - 1);
  }

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) {
    return null;
  }
  return { start, end };
}
