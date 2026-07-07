import { handleError, json, listResponses, listSamples, requireAdmin, requireMethod } from "../../_utils.js";

export async function onRequestGet({ request, env }) {
  try {
    requireMethod(request, ["GET"]);
    await requireAdmin(request, env);
    return json({
      samples: await listSamples(env),
      responses: await listResponses(env),
    });
  } catch (error) {
    return handleError(error);
  }
}
