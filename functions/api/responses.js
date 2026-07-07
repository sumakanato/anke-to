import { createResponse, handleError, json, requireMethod } from "../_utils.js";

export async function onRequestPost({ request, env }) {
  try {
    requireMethod(request, ["POST"]);
    await createResponse(env, await request.json());
    return json({ ok: true }, 201);
  } catch (error) {
    return handleError(error);
  }
}
