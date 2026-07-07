import { deleteSample, handleError, json, requireAdmin, requireMethod } from "../../../_utils.js";

export async function onRequestDelete({ request, env, params }) {
  try {
    requireMethod(request, ["DELETE"]);
    await requireAdmin(request, env);
    await deleteSample(env, params.id);
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
