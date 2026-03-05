const TOTAL_STEPS = 4;
let currentStep = 1;

function showStep(step) {
  for (const section of document.querySelectorAll(".wgi-step")) {
    section.hidden = parseInt(section.dataset.step) !== step;
  }
  currentStep = step;
  document.getElementById("progress-bar").style.width =
    `${(step / TOTAL_STEPS) * 100}%`;
}

async function saveApiKey() {
  const input = document.getElementById("api-key-input");
  const key = input.value.trim();
  const errorEl = document.getElementById("key-error");
  const savedEl = document.getElementById("key-saved");

  if (!key) {
    errorEl.hidden = false;
    savedEl.hidden = true;
    return false;
  }

  errorEl.hidden = true;
  await chrome.storage.local.set({ apiKey: key });
  chrome.runtime.sendMessage({ type: "apikey-saved" });
  savedEl.hidden = false;
  return true;
}

async function loadExistingKey() {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (apiKey) {
    document.getElementById("api-key-input").value = apiKey;
    document.getElementById("key-saved").hidden = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadExistingKey();

  for (const btn of document.querySelectorAll("[data-next]")) {
    btn.addEventListener("click", async () => {
      if (currentStep === 2) {
        const saved = await saveApiKey();
        if (!saved) return;
      }
      if (currentStep < TOTAL_STEPS) showStep(currentStep + 1);
    });
  }

  for (const btn of document.querySelectorAll("[data-prev]")) {
    btn.addEventListener("click", () => {
      if (currentStep > 1) showStep(currentStep - 1);
    });
  }

  const finishBtn = document.getElementById("finish-btn");
  if (finishBtn) {
    finishBtn.addEventListener("click", () => window.close());
  }
});
