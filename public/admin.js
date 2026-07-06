const loginPanel = document.querySelector("#loginPanel");
const adminPanel = document.querySelector("#adminPanel");
const loginForm = document.querySelector("#loginForm");
const loginMessage = document.querySelector("#loginMessage");
const refreshButton = document.querySelector("#refreshButton");
const csvLink = document.querySelector("#csvLink");
const sampleForm = document.querySelector("#sampleForm");
const sampleMessage = document.querySelector("#sampleMessage");
const sampleList = document.querySelector("#sampleList");
const metricsGrid = document.querySelector(".metrics-grid");
const responseRows = document.querySelector("#responseRows");
const emptyResults = document.querySelector("#emptyResults");

const tokenKey = "survey-admin-token";

function token() {
  return sessionStorage.getItem(tokenKey);
}

function authHeaders() {
  return { authorization: `Bearer ${token()}` };
}

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.className = `message ${type}`.trim();
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showAdmin() {
  loginPanel.classList.add("hidden");
  adminPanel.classList.remove("hidden");
  csvLink.href = `/api/admin/responses-csv?token=${encodeURIComponent(token())}`;
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}), ...authHeaders() };
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) throw new Error(String(response.status));
  return response.headers.get("content-type")?.includes("application/json")
    ? response.json()
    : response.text();
}

function sampleNameMap(samples) {
  return new Map(samples.map((sample) => [sample.id, sample.title]));
}

function renderSamples(samples) {
  if (!samples.length) {
    sampleList.innerHTML = '<p class="empty-state">メディアはまだありません。</p>';
    return;
  }

  sampleList.innerHTML = samples
    .map(
      (sample) => `
        <div class="sample-row">
          <div>
            <strong>${escapeHtml(sample.title)}</strong>
            <p>${escapeHtml(sample.originalName || sample.url)}</p>
          </div>
          <button class="secondary-button" type="button" data-delete-sample="${escapeHtml(sample.id)}">削除</button>
        </div>
      `
    )
    .join("");
}

function average(values) {
  if (!values.length) return "-";
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2);
}

function renderMetrics(samples, responses) {
  const bySample = new Map(samples.map((sample) => [sample.id, { sample, quality: [], timbre: [] }]));
  for (const response of responses) {
    for (const answer of response.answers || []) {
      const bucket = bySample.get(answer.sampleId);
      if (!bucket) continue;
      bucket.quality.push(Number(answer.synthesisQuality));
      bucket.timbre.push(Number(answer.timbreAccuracy));
    }
  }

  metricsGrid.innerHTML = [...bySample.values()]
    .map(
      ({ sample, quality, timbre }) => `
        <article class="metric-card">
          <h3>${escapeHtml(sample.title)}</h3>
          <div class="metric-values">
            <div class="metric-value">
              <strong>${average(quality)}</strong>
              <span>合成品質</span>
            </div>
            <div class="metric-value">
              <strong>${average(timbre)}</strong>
              <span>音色</span>
            </div>
          </div>
        </article>
      `
    )
    .join("");
}

function renderResponses(samples, responses) {
  const names = sampleNameMap(samples);
  const rows = [];
  for (const response of responses) {
    for (const answer of response.answers || []) {
      rows.push({
        createdAt: response.createdAt,
        evaluator: response.evaluator || "-",
        group: response.group || "-",
        sample: names.get(answer.sampleId) || answer.sampleId,
        quality: answer.synthesisQuality,
        timbre: answer.timbreAccuracy,
        comment: answer.comment || "",
      });
    }
  }

  emptyResults.classList.toggle("hidden", rows.length > 0);
  responseRows.innerHTML = rows
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(new Date(row.createdAt).toLocaleString("ja-JP"))}</td>
          <td>${escapeHtml(row.evaluator)}</td>
          <td>${escapeHtml(row.group)}</td>
          <td>${escapeHtml(row.sample)}</td>
          <td>${escapeHtml(row.quality)}</td>
          <td>${escapeHtml(row.timbre)}</td>
          <td>${escapeHtml(row.comment)}</td>
        </tr>
      `
    )
    .join("");
}

async function loadDashboard() {
  const data = await api("/api/admin/responses");
  renderSamples(data.samples);
  renderMetrics(data.samples, data.responses);
  renderResponses(data.samples, data.responses);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginMessage, "");

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: loginForm.elements.password.value }),
    });
    if (!response.ok) throw new Error("login failed");
    const data = await response.json();
    sessionStorage.setItem(tokenKey, data.token);
    showAdmin();
    await loadDashboard();
  } catch {
    setMessage(loginMessage, "ログインできませんでした。", "error");
  }
});

refreshButton.addEventListener("click", () => {
  loadDashboard().catch(() => {});
});

sampleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(sampleMessage, "");
  const button = sampleForm.querySelector("button");
  button.disabled = true;
  try {
    await api("/api/admin/samples", {
      method: "POST",
      body: new FormData(sampleForm),
    });
    sampleForm.reset();
    setMessage(sampleMessage, "追加しました。", "success");
    await loadDashboard();
  } catch {
    setMessage(sampleMessage, "追加に失敗しました。", "error");
  } finally {
    button.disabled = false;
  }
});

sampleList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-sample]");
  if (!button) return;
  button.disabled = true;
  try {
    await api(`/api/admin/samples/${button.dataset.deleteSample}`, { method: "DELETE" });
    await loadDashboard();
  } catch {
    button.disabled = false;
  }
});

if (token()) {
  showAdmin();
  loadDashboard().catch(() => {
    sessionStorage.removeItem(tokenKey);
    loginPanel.classList.remove("hidden");
    adminPanel.classList.add("hidden");
  });
}
