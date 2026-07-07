import { createAdminToken, handleError, json, requireMethod } from "../../_utils.js";

export async function onRequestPost({ request, env }) {
  try {
    requireMethod(request, ["POST"]);
    if (!env.ADMIN_PASSWORD) {
      throw Object.assign(new Error("ADMIN_PASSWORD is required."), { status: 500 });
    }

    const body = await request.json();
    if (body.password !== env.ADMIN_PASSWORD) {
      throw Object.assign(new Error("Invalid password"), { status: 401 });
    }

    return json({ token: await createAdminToken(env) });
  } catch (error) {
    return handleError(error);
  }
}
