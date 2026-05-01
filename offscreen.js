chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "clipboard-write") return;

  writeToClipboard(msg.text)
    .then(() => {
      chrome.runtime.sendMessage({
        type: "clipboard-write-result",
        success: true,
      });
    })
    .catch((err) => {
      chrome.runtime.sendMessage({
        type: "clipboard-write-result",
        success: false,
        error: err.message,
      });
    });
});

async function writeToClipboard(text) {
  // navigator.clipboard.writeText requires a focused document, which offscreen
  // documents never are. Use execCommand("copy") on a textarea instead.
  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!ok) throw new Error("execCommand copy failed");
}
