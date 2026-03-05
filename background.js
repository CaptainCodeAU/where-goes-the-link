// ============================================================
// background.js — Service Worker (entry point)
// All event listeners MUST be registered synchronously at the
// top level. Never inside async callbacks or promises.
// ============================================================

const DEFAULTS = {
  apiBaseUrl: "https://core.unshortlink.com",
  apiEndpointPath: "/api/v1/status",
  apiKey: "",
  apiMaxRedirects: 10,
  apiTimeout: 5000,
  iconProcessingDuration: 0,
  iconSuccessDuration: 3000,
  iconErrorDuration: 3000,
  toastOverlayDuration: 8000,
  toastOsDuration: 8000,
  quotaTotal: 500,
  quotaStartDate: "",
  quotaRemaining: null,
  quotaUsage: null,
  quotaResetSeconds: null,
  quotaLastUpdated: null,
  lastApiCallTimestamp: null,
  badgeEnabled: false,
  badgeMode: "days",
};

const RATE_LIMIT_COOLDOWN_MS = 5000;

// ---- Utilities ----

async function getSettings(...keys) {
  const result = await chrome.storage.local.get(keys);
  const out = {};
  for (const key of keys) {
    out[key] = result[key] !== undefined ? result[key] : DEFAULTS[key];
  }
  return out;
}

function iconPaths(state) {
  return {
    16: `icons/icon-${state}-16.png`,
    32: `icons/icon-${state}-32.png`,
    48: `icons/icon-${state}-48.png`,
    128: `icons/icon-${state}-128.png`,
  };
}

async function setIconState(state) {
  await chrome.action.setIcon({ path: iconPaths(state) });
}

// ---- Clipboard ----

async function copyToClipboard(text) {
  try {
    if (!(await chrome.offscreen.hasDocument())) {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: [chrome.offscreen.Reason.CLIPBOARD],
        justification: "Write text to the clipboard.",
      });
    }

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.runtime.onMessage.removeListener(listener);
        reject(new Error("Offscreen clipboard timed out"));
      }, 3000);

      const listener = (msg) => {
        if (msg.type === "clipboard-write-result") {
          clearTimeout(timeout);
          chrome.runtime.onMessage.removeListener(listener);
          msg.success ? resolve() : reject(new Error(msg.error));
        }
      };
      chrome.runtime.onMessage.addListener(listener);
      chrome.runtime.sendMessage({ type: "clipboard-write", text });
    });
    console.log("Clipboard: copied via offscreen document");
  } catch (err) {
    console.error("Clipboard: offscreen also failed:", err.message);
    throw err;
  }
}

// ---- API Call ----

async function callUnshortLinkApi(url) {
  const { apiBaseUrl, apiEndpointPath, apiKey, apiMaxRedirects, apiTimeout } =
    await getSettings(
      "apiBaseUrl",
      "apiEndpointPath",
      "apiKey",
      "apiMaxRedirects",
      "apiTimeout",
    );

  const controller = new AbortController();
  // Overall timeout: allow enough time for multiple redirect hops + API processing
  const overallTimeout = apiTimeout * 3 + 5000;
  const timeoutId = setTimeout(() => controller.abort(), overallTimeout);

  try {
    console.log(
      `  fetch: POST ${apiBaseUrl}${apiEndpointPath} (per-hop timeout: ${apiTimeout}ms, abort after: ${overallTimeout}ms)`,
    );
    const fetchStart = performance.now();
    const response = await fetch(`${apiBaseUrl}${apiEndpointPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Billing-Token": apiKey,
      },
      body: JSON.stringify({
        url,
        max_redirects: apiMaxRedirects,
        timeout: apiTimeout,
      }),
      signal: controller.signal,
    });
    console.log(
      `  fetch: response received in ${Math.round(performance.now() - fetchStart)}ms (HTTP ${response.status})`,
    );

    clearTimeout(timeoutId);
    const quotaHeader = response.headers.get("X-Quota");

    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch {
        /* ignore */
      }
      return {
        success: false,
        data: null,
        error: {
          status: response.status,
          message: response.statusText,
          detail,
        },
        quotaHeader,
      };
    }

    const data = await response.json();
    return { success: true, data, error: null, quotaHeader };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      return {
        success: false,
        data: null,
        error: {
          status: 0,
          message: `Request timed out after ${overallTimeout}ms`,
          detail: "",
        },
        quotaHeader: null,
      };
    }
    return {
      success: false,
      data: null,
      error: {
        status: 0,
        message: `Network error: ${err.message}`,
        detail: "",
      },
      quotaHeader: null,
    };
  }
}

// ---- Quota Parsing ----

function parseQuotaHeader(headerValue) {
  if (!headerValue) return null;
  const parts = headerValue.split(";").map((s) => s.trim());
  const parsed = {};
  for (const part of parts) {
    const [key, ...rest] = part.split("=");
    parsed[key.trim()] = rest.join("=").trim();
  }
  return {
    label: parsed.label || "",
    limitType: parsed["limit-type"] || "",
    quota: parseInt(parsed.quota, 10) || 0,
    remaining: parseInt(parsed.remaining, 10) || 0,
    usage: parseInt(parsed.usage, 10) || 0,
    callUsage: parseInt(parsed["call-usage"], 10) || 0,
    reset: parseInt(parsed.reset, 10) || 0,
  };
}

async function storeQuotaData(quotaHeader) {
  const parsed = parseQuotaHeader(quotaHeader);
  if (!parsed) return;
  await chrome.storage.local.set({
    quotaRemaining: parsed.remaining,
    quotaUsage: parsed.usage,
    quotaResetSeconds: parsed.reset,
    quotaTotal: parsed.quota,
    quotaLastUpdated: new Date().toISOString(),
  });
  return parsed;
}

// ---- Badge & Tooltip ----

async function updateBadgeAndTooltip() {
  const {
    quotaRemaining,
    quotaTotal,
    quotaResetSeconds,
    badgeEnabled,
    badgeMode,
  } = await getSettings(
    "quotaRemaining",
    "quotaTotal",
    "quotaResetSeconds",
    "badgeEnabled",
    "badgeMode",
  );

  const total = quotaTotal || 500;
  const daysRemaining =
    quotaResetSeconds !== null && quotaResetSeconds !== undefined
      ? Math.ceil(quotaResetSeconds / 86400)
      : null;

  // Badge text
  if (!badgeEnabled) {
    await chrome.action.setBadgeText({ text: "" });
  } else if (badgeMode === "calls" && quotaRemaining !== null) {
    await chrome.action.setBadgeText({ text: String(quotaRemaining) });
  } else if (daysRemaining !== null) {
    await chrome.action.setBadgeText({ text: String(daysRemaining) });
  }

  // Badge color
  if (badgeEnabled) {
    const lowThreshold = Math.floor(total * 0.1);
    const bgColor =
      quotaRemaining !== null && quotaRemaining <= lowThreshold
        ? "#DC3535"
        : "#666666";
    await chrome.action.setBadgeBackgroundColor({ color: bgColor });
  }

  // Tooltip always shows full info
  const callsText =
    quotaRemaining !== null ? `${quotaRemaining} / ${total}` : "Unknown";
  const daysText = daysRemaining !== null ? String(daysRemaining) : "Unknown";
  await chrome.action.setTitle({
    title: `Where Goes the Link\nCalls remaining: ${callsText}\nDays until reset: ${daysText}`,
  });
}

// ---- Notifications ----

async function showOsNotification(title, message) {
  const { toastOsDuration } = await getSettings("toastOsDuration");
  const notifId = `wgi-${Date.now()}`;
  await chrome.notifications.create(notifId, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon-default-128.png"),
    title,
    message,
  });
  if (toastOsDuration > 0) {
    setTimeout(() => chrome.notifications.clear(notifId), toastOsDuration);
  }
}

async function injectOverlay(tabId, data) {
  const { toastOverlayDuration } = await getSettings("toastOverlayDuration");
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["content-overlay.css"],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-overlay.js"],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (payload) => {
        window.dispatchEvent(
          new CustomEvent("wgi-show-toast", { detail: payload }),
        );
      },
      args: [{ ...data, duration: toastOverlayDuration }],
    });
  } catch {
    // Injection fails on restricted pages — OS notification is the fallback
  }
}

function formatSuccessToast(data) {
  const destination = data.long_url || data.final_url || "Unknown";
  const redirectCount = data.redirect_count || data.url_chain?.length - 1 || 0;

  let chainText = "";
  if (data.url_chain && data.url_chain.length) {
    chainText = data.url_chain
      .map(
        (url, i) =>
          `  ${i + 1}. ${url} → ${(data.status_chain || [])[i] || "?"}`,
      )
      .join("\n");
    chainText = `\n\nRedirect chain (${redirectCount} hops):\n${chainText}`;
  }

  return {
    title: "Expanded URL copied to clipboard",
    message: `Destination: ${destination}${chainText}`,
    type: "success",
  };
}

function formatErrorToast(error, currentUrl) {
  return {
    title: "Error — current URL copied instead",
    message: `Error: ${error.status || "?"} ${error.message || ""}\nDetail: ${error.detail || "None"}\nURL: ${currentUrl}`,
    type: "error",
  };
}

async function notifyBoth(tabId, toastData) {
  const prefix = toastData.type === "success" ? "\u2713" : "\u26A0";
  showOsNotification(`${prefix} ${toastData.title}`, toastData.message);
  injectOverlay(tabId, toastData);
}

// ---- Icon Transition ----

async function iconTransition(state, durationKey) {
  await setIconState(state);
  if (!durationKey) return;
  const settings = await getSettings(durationKey);
  const duration = settings[durationKey];
  if (duration > 0) {
    setTimeout(() => setIconState("default"), duration);
  } else {
    await setIconState("default");
  }
}

// ---- Rate Limit ----

async function checkCooldown() {
  const { lastApiCallTimestamp } = await getSettings("lastApiCallTimestamp");
  if (!lastApiCallTimestamp) return { allowed: true, waitMs: 0 };
  const elapsed = Date.now() - lastApiCallTimestamp;
  if (elapsed >= RATE_LIMIT_COOLDOWN_MS) return { allowed: true, waitMs: 0 };
  return { allowed: false, waitMs: RATE_LIMIT_COOLDOWN_MS - elapsed };
}

async function recordApiCall() {
  await chrome.storage.local.set({ lastApiCallTimestamp: Date.now() });
}

// ---- Main Click Handler ----

let isProcessing = false;

async function handleClick(tab) {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const { apiKey } = await getSettings("apiKey");

    if (!apiKey) {
      await showOsNotification(
        "Setup required",
        "Click the extension's Setup Guide to get started.",
      );
      return;
    }

    const currentUrl = tab.url || "";

    const isWebUrl =
      currentUrl.startsWith("http://") || currentUrl.startsWith("https://");

    if (!isWebUrl) {
      const isEmpty =
        !currentUrl ||
        currentUrl === "chrome://newtab/" ||
        currentUrl === "about:blank";
      if (isEmpty) {
        await showOsNotification(
          "No URL to expand",
          "Navigate to a page with a shortened URL first, then click the icon to expand it.",
        );
        return;
      }
      await copyToClipboard(currentUrl);
      await notifyBoth(tab.id, {
        title: "Non-web URL — copied as-is",
        message: currentUrl,
        type: "success",
      });
      await iconTransition("success", "iconSuccessDuration");
      return;
    }

    // Quota check
    const { quotaRemaining } = await getSettings("quotaRemaining");
    if (quotaRemaining === 0) {
      await chrome.tabs.create({
        url: "https://portal.unshortlink.com/pricing/",
      });
      await showOsNotification(
        "Quota exhausted",
        "Upgrade your plan to continue expanding URLs.",
      );
      return;
    }

    // Rate limit check
    const cooldown = await checkCooldown();
    if (!cooldown.allowed) {
      const waitSec = Math.ceil(cooldown.waitMs / 1000);
      await copyToClipboard(currentUrl);
      await notifyBoth(tab.id, {
        title: "Rate limited",
        message: `Please wait ${waitSec} seconds (rate limit). Current URL copied.`,
        type: "error",
      });
      return;
    }

    // Processing
    await setIconState("processing");
    const t0 = performance.now();
    console.log(`[${0}ms] API call starting for: ${currentUrl}`);
    const result = await callUnshortLinkApi(currentUrl);
    const t1 = performance.now();
    console.log(`[${Math.round(t1 - t0)}ms] API response received`);
    console.log("API result:", JSON.stringify(result, null, 2));
    await recordApiCall();

    if (result.quotaHeader) {
      await storeQuotaData(result.quotaHeader);
      await updateBadgeAndTooltip();
    }
    const t2 = performance.now();
    console.log(
      `[${Math.round(t2 - t0)}ms] Quota stored, proceeding to clipboard`,
    );

    if (result.success && result.data) {
      const expandedUrl =
        result.data.long_url || result.data.final_url || currentUrl;

      if (expandedUrl === currentUrl) {
        await copyToClipboard(currentUrl);
        await notifyBoth(tab.id, {
          title: "No redirects found — URL copied as-is",
          message: currentUrl,
          type: "success",
        });
        await iconTransition("success", "iconSuccessDuration");
        return;
      }

      await copyToClipboard(expandedUrl);
      await notifyBoth(tab.id, formatSuccessToast(result.data));
      await iconTransition("success", "iconSuccessDuration");
    } else {
      await copyToClipboard(currentUrl);
      await notifyBoth(
        tab.id,
        formatErrorToast(
          result.error || { status: 0, message: "Unknown error" },
          currentUrl,
        ),
      );
      await iconTransition("error", "iconErrorDuration");
    }
  } catch (err) {
    console.error("handleClick error:", err);
    try {
      await copyToClipboard(tab.url || "");
    } catch (copyErr) {
      console.error("Clipboard: last resort also failed:", copyErr.message);
    }
    await iconTransition("error", "iconErrorDuration");
  } finally {
    isProcessing = false;
  }
}

// ---- Install & Startup ----

async function handleInstalled(details) {
  if (details.reason === "install") {
    const existing = await chrome.storage.local.get(null);
    const toSet = {};
    for (const [key, val] of Object.entries(DEFAULTS)) {
      if (existing[key] === undefined) toSet[key] = val;
    }
    if (Object.keys(toSet).length) {
      await chrome.storage.local.set(toSet);
    }
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
  }

  chrome.contextMenus.create({
    id: "wgi-settings",
    title: "Settings",
    contexts: ["action"],
  });
  chrome.contextMenus.create({
    id: "wgi-setup-guide",
    title: "Setup Guide",
    contexts: ["action"],
  });

  await restoreState();
}

async function restoreState() {
  const { apiKey } = await getSettings("apiKey");
  if (!apiKey) {
    await setIconState("disabled");
    await chrome.action.setTitle({
      title: "Where Goes the Link — Setup required",
    });
  } else {
    await setIconState("default");
    await updateBadgeAndTooltip();
  }
}

function handleContextMenu(info) {
  if (info.menuItemId === "wgi-settings") {
    chrome.runtime.openOptionsPage();
  } else if (info.menuItemId === "wgi-setup-guide") {
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") });
  }
}

function handleMessage(msg, _sender, sendResponse) {
  if (msg.type === "apikey-saved") {
    restoreState().then(() => updateBadgeAndTooltip());
    sendResponse({ ok: true });
  }
  return false;
}

// ---- Register all listeners synchronously at top level ----

chrome.action.onClicked.addListener(handleClick);
chrome.runtime.onInstalled.addListener(handleInstalled);
chrome.runtime.onStartup?.addListener(restoreState);
chrome.contextMenus.onClicked.addListener(handleContextMenu);
chrome.runtime.onMessage.addListener(handleMessage);
