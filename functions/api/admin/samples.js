import { createSample, handleError, json, requireAdmin, requireMethod } from "../../_utils.js";

export async function onRequestPost({ request, env }) {
  try {
    requireMethod(request, ["POST"]);
    await requireAdmin(request, env);
    const sample = await createSample(env, await request.formData());
    return json(sample, 201);
  } catch (error) {
    return handleError(error);
  }
}
