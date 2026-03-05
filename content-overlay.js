(function () {
  const EXISTING = document.getElementById("wgi-toast-container");
  if (EXISTING) EXISTING.remove();

  window.addEventListener("wgi-show-toast", (e) => {
    const { title, message, type, duration } = e.detail;
    render(title, message, type, duration || 8000);
  });

  function render(title, message, type, duration) {
    const old = document.getElementById("wgi-toast-container");
    if (old) old.remove();

    const container = document.createElement("div");
    container.id = "wgi-toast-container";
    container.className = "wgi-toast-backdrop";

    const icon = type === "success" ? "\u2713" : "\u26A0";
    const headerClass = type === "success" ? "wgi-success" : "wgi-error";
    const barClass = type === "success" ? "" : "wgi-error";

    container.innerHTML = `
      <div class="wgi-toast">
        <div class="wgi-toast-header ${headerClass}">
          <span>${icon}</span>
          <span>${escapeHtml(title)}</span>
        </div>
        <div class="wgi-toast-body">${escapeHtml(message)}</div>
        <div class="wgi-toast-progress">
          <div class="wgi-toast-progress-bar ${barClass}" style="width:100%"></div>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    requestAnimationFrame(() => {
      const bar = container.querySelector(".wgi-toast-progress-bar");
      if (bar) {
        bar.style.transitionDuration = `${duration}ms`;
        bar.style.width = "0%";
      }
    });

    setTimeout(() => {
      const toast = container.querySelector(".wgi-toast");
      if (toast) toast.classList.add("wgi-removing");
      setTimeout(() => container.remove(), 250);
    }, duration);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();
