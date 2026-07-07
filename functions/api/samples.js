import { handleError, json, listSamples, requireMethod } from "../_utils.js";

export async function onRequestGet({ request, env }) {
  try {
    requireMethod(request, ["GET"]);
    return json(await listSamples(env));
  } catch (error) {
    return handleError(error);
  }
}
