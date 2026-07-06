const qualityScale = [
  ["1", "非常に悪い(Bad)"],
  ["2", "少し悪い(Poor)"],
  ["3", "まあまあ良い(Fair)"],
  ["4", "良い(Good)"],
  ["5", "非常に良い(Excellent)"],
];

const timbreScale = [
  ["1", "目的音ではない"],
  ["2", "目的音っぽくない"],
  ["3", "まあまあ目的音である"],
  ["4", "かなり目的音っぽい"],
  ["5", "目的音である"],
];

const samplesEl = document.querySelector("#samples");
const form = document.querySelector("#surveyForm");
const messageEl = document.querySelector("#formMessage");
const submitButton = document.querySelector("#submitButton");

function setMessage(text, type = "") {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`.trim();
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ratingGroup(sampleId, name, title, scale) {
  return `
    <div class="question-block">
      <p class="question-title">${escapeHtml(title)} <span aria-hidden="true">*</span></p>
      <div class="rating-grid" role="radiogroup" aria-label="${escapeHtml(title)}">
        ${scale
          .map(
            ([value, label]) => `
              <label class="rating-option">
                <input type="radio" name="${name}-${sampleId}" value="${value}" required>
                <span class="rating-card">
                  <span class="rating-number">${value}</span>
                  <span class="rating-text">${escapeHtml(label)}</span>
                </span>
              </label>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function mediaMarkup(sample) {
  const title = escapeHtml(sample.title);
  if (sample.kind === "video") {
    return `<video controls preload="metadata" src="${sample.url}" aria-label="${title}"></video>`;
  }
  return `<audio controls preload="metadata" src="${sample.url}" aria-label="${title}"></audio>`;
}

function sampleCard(sample, index) {
  const id = escapeHtml(sample.id);
  return `
    <section class="form-card sample-card" data-sample-id="${id}">
      <div class="media-frame">
        <h2>${index + 1}. ${escapeHtml(sample.title)}</h2>
        ${mediaMarkup(sample)}
      </div>
      ${ratingGroup(id, "quality", "合成品質評価", qualityScale)}
      ${ratingGroup(id, "timbre", "音色評価", timbreScale)}
      <div class="question-block">
        <label class="field-label" for="comment-${id}">コメント</label>
        <textarea id="comment-${id}" name="comment-${id}" placeholder="任意"></textarea>
      </div>
    </section>
  `;
}

async function loadSamples() {
  try {
    const response = await fetch("/api/samples");
    const samples = await response.json();
    if (!samples.length) {
      samplesEl.innerHTML = '<section class="form-card"><p class="empty-state">評価対象はまだありません。</p></section>';
      submitButton.disabled = true;
      return;
    }
    samplesEl.innerHTML = samples.map(sampleCard).join("");
  } catch {
    samplesEl.innerHTML = '<section class="form-card"><p class="empty-state">読み込みに失敗しました。</p></section>';
    submitButton.disabled = true;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");

  const cards = [...document.querySelectorAll(".sample-card")];
  const answers = cards.map((card) => {
    const sampleId = card.dataset.sampleId;
    return {
      sampleId,
      synthesisQuality: form.elements[`quality-${sampleId}`]?.value,
      timbreAccuracy: form.elements[`timbre-${sampleId}`]?.value,
      comment: form.elements[`comment-${sampleId}`]?.value || "",
    };
  });

  const incomplete = answers.some((answer) => !answer.synthesisQuality || !answer.timbreAccuracy);
  if (incomplete) {
    setMessage("未回答の評価があります。", "error");
    return;
  }

  submitButton.disabled = true;
  try {
    const response = await fetch("/api/responses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        evaluator: form.elements.evaluator.value,
        group: form.elements.group.value,
        answers,
      }),
    });
    if (!response.ok) throw new Error("submit failed");
    form.reset();
    setMessage("送信しました。ありがとうございました。", "success");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch {
    setMessage("送信に失敗しました。", "error");
  } finally {
    submitButton.disabled = false;
  }
});

loadSamples();
