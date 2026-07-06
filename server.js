const fs = require("fs/promises");
const http = require("http");
const path = require("path");

const { getAdminPassword } = require("./lib/auth");
const {
  adminResponsesCsvHandler,
  adminResponsesHandler,
  adminSampleByIdHandler,
  adminSamplesHandler,
  loginHandler,
  samplesHandler,
  submitResponseHandler,
} = require("./lib/handlers");
const { sendText } = require("./lib/http");
const { ensureLocalStorage } = require("./lib/storage");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

async function handleStatic(req, res, pathname) {
  const routePath = pathname === "/" ? "/index.html" : pathname === "/admin" ? "/admin.html" : pathname;
  const decoded = decodeURIComponent(routePath);
  const target = path.normalize(path.join(PUBLIC_DIR, decoded));
  if (!target.startsWith(PUBLIC_DIR)) return sendText(res, 403, "Forbidden");

  try {
    const stat = await fs.stat(target);
    if (!stat.isFile()) return sendText(res, 404, "Not found");
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "content-length": stat.size,
    });
    res.end(await fs.readFile(target));
  } catch {
    sendText(res, 404, "Not found");
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  if (pathname === "/api/samples") return samplesHandler(req, res);
  if (pathname === "/api/responses") return submitResponseHandler(req, res);
  if (pathname === "/api/admin/login") return loginHandler(req, res);
  if (pathname === "/api/admin/responses") return adminResponsesHandler(req, res);
  if (pathname === "/api/admin/responses-csv") return adminResponsesCsvHandler(req, res);
  if (pathname === "/api/admin/samples") return adminSamplesHandler(req, res);
  if (pathname.startsWith("/api/admin/samples/")) return adminSampleByIdHandler(req, res);

  if (req.method === "GET") return handleStatic(req, res, pathname);
  sendText(res, 405, "Method not allowed");
}

ensureLocalStorage().then(async () => {
  const password = await getAdminPassword();
  http.createServer(handleRequest).listen(PORT, "127.0.0.1", () => {
    console.log(`Survey site: http://localhost:${PORT}`);
    console.log(`Admin page:  http://localhost:${PORT}/admin`);
    if (!process.env.ADMIN_PASSWORD) {
      console.log(`Admin password: ${password}`);
      console.log("Set ADMIN_PASSWORD to override this generated password.");
    }
  });
});
