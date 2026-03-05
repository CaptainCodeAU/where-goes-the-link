const FIELDS = [
  "apiKey",
  "apiBaseUrl",
  "apiEndpointPath",
  "apiMaxRedirects",
  "apiTimeout",
  "iconProcessingDuration",
  "iconSuccessDuration",
  "iconErrorDuration",
  "badgeEnabled",
  "badgeMode",
  "toastOverlayDuration",
  "toastOsDuration",
  "quotaTotal",
  "quotaStartDate",
];

const NUMBER_FIELDS = new Set([
  "apiMaxRedirects",
  "apiTimeout",
  "iconProcessingDuration",
  "iconSuccessDuration",
  "iconErrorDuration",
  "toastOverlayDuration",
  "toastOsDuration",
  "quotaTotal",
]);

const BOOLEAN_FIELDS = new Set(["badgeEnabled"]);

const BOOLEAN_DEFAULTS = { badgeEnabled: false };

async function loadSettings() {
  const data = await chrome.storage.local.get(FIELDS);
  for (const key of FIELDS) {
    const el = document.getElementById(key);
    if (!el) continue;
    const val = data[key];
    if (BOOLEAN_FIELDS.has(key)) {
      el.checked =
        val !== undefined ? Boolean(val) : Boolean(BOOLEAN_DEFAULTS[key]);
    } else if (el.tagName === "SELECT") {
      el.value = val !== undefined && val !== null ? val : el.options[0].value;
    } else {
      el.value = val !== undefined && val !== null ? val : "";
    }
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const values = {};
  for (const key of FIELDS) {
    const el = document.getElementById(key);
    if (!el) continue;
    if (BOOLEAN_FIELDS.has(key)) {
      values[key] = el.checked;
    } else if (NUMBER_FIELDS.has(key)) {
      values[key] = el.value === "" ? 0 : parseInt(el.value, 10);
    } else {
      values[key] = el.value;
    }
  }
  await chrome.storage.local.set(values);
  chrome.runtime.sendMessage({ type: "apikey-saved" });

  const status = document.getElementById("save-status");
  status.textContent = "Saved";
  status.classList.add("wgi-visible");
  setTimeout(() => status.classList.remove("wgi-visible"), 2000);
}

function setupPasswordToggles() {
  for (const btn of document.querySelectorAll(".wgi-toggle-vis")) {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const isPassword = target.type === "password";
      target.type = isPassword ? "text" : "password";
      btn.textContent = isPassword ? "Hide" : "Show";
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  setupPasswordToggles();
  document
    .getElementById("settings-form")
    .addEventListener("submit", saveSettings);
});
