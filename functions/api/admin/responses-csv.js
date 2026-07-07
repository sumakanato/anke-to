import {
  handleError,
  listResponses,
  listSamples,
  requireAdmin,
  requireMethod,
  responsesToCsv,
} from "../../_utils.js";

export async function onRequestGet({ request, env }) {
  try {
    requireMethod(request, ["GET"]);
    await requireAdmin(request, env);
    const csv = responsesToCsv(await listSamples(env), await listResponses(env));
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="survey-results.csv"',
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
