(function () {
  const TIMER_ID = "focus-guard-timer";
  const TIMER_STYLE_ID = "focus-guard-timer-style";
  const REMINDER_OVERLAY_ID = "focus-guard-reminder-overlay";
  const REMINDER_STYLE_ID = "focus-guard-reminder-style";

  let refreshId = null;
  let activeReminderRuleId = null;
  let pausedMediaElements = [];
  let playBlockerAttached = false;
  let escapeKeyHandler = null;

  initTimer();

  function initTimer() {
    safeRefreshTimer();
    refreshId = setInterval(safeRefreshTimer, 1000);
    window.addEventListener("pagehide", stopTimer, { once: true });
  }

  function safeRefreshTimer() {
    refreshTimer().catch(stopTimer);
  }

  function stopTimer() {
    clearInterval(refreshId);
    removeTimer();
    hideReminderPopup();
  }

  async function refreshTimer() {
    const response = await sendTimerStatusMessage();
    const status = response?.status;
    const reminder = response?.reminder;

    if (!status) {
      removeTimer();
    } else {
      renderTimer(status);
    }

    handleReminder(reminder);
  }

  function isAnyMediaPlaying() {
    const media = getAllMediaElements();
    return media.some((el) => !el.paused && !el.ended && el.readyState > 1);
  }

  function getAllMediaElements(root = document) {
    const list = Array.from(root.querySelectorAll("video, audio"));
    try {
      const all = root.querySelectorAll("*");
      for (const el of all) {
        if (el.shadowRoot) {
          list.push(...getAllMediaElements(el.shadowRoot));
        }
      }
    } catch {}
    return list;
  }

  async function sendTimerStatusMessage() {
    try {
      return await chrome.runtime.sendMessage({
        type: "FOCUS_GUARD_TIMER_STATUS",
        url: location.href,
        isVisible: document.visibilityState === "visible",
        hasMedia: isAnyMediaPlaying(),
      });
    } catch {
      stopTimer();
      return null;
    }
  }

  function renderTimer(status) {
    ensureStyle();

    const timer = getOrCreateTimer();
    const used = formatTimer(status.usedMs);
    const limit = formatTimer(status.limitMs);

    timer.textContent = `${used} / ${limit}`;
    timer.dataset.expired = String(status.remainingMs <= 0);
  }

  function getOrCreateTimer() {
    const existing = document.getElementById(TIMER_ID);
    if (existing) return existing;

    const timer = document.createElement("div");
    timer.id = TIMER_ID;
    timer.setAttribute("role", "status");
    timer.setAttribute("aria-live", "polite");
    document.documentElement.append(timer);
    return timer;
  }

  function removeTimer() {
    document.getElementById(TIMER_ID)?.remove();
  }

  function ensureStyle() {
    if (document.getElementById(TIMER_STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = TIMER_STYLE_ID;
    style.textContent = `
      #${TIMER_ID} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        background: #7f1d1d;
        color: #fff7f3;
        border: 1px solid rgba(255, 247, 243, 0.36);
        border-radius: 8px;
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.24);
        font: 700 13px/1.35 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        max-width: min(360px, calc(100vw - 32px));
        padding: 10px 12px;
        pointer-events: none;
      }

      #${TIMER_ID}[data-expired="true"] {
        background: #991b1b;
      }
    `;
    document.documentElement.append(style);
  }

  function formatTimer(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }

  // --- REMINDER LOGIC ---

  function handleReminder(reminder) {
    if (!reminder || !reminder.shouldTrigger) {
      if (activeReminderRuleId && (!reminder || reminder.ruleId === activeReminderRuleId)) {
        hideReminderPopup();
      }
      return;
    }

    if (document.getElementById(REMINDER_OVERLAY_ID)) {
      return;
    }

    showReminderPopup(reminder);
  }

  function pauseAllMedia() {
    pausedMediaElements = [];
    const media = getAllMediaElements();
    media.forEach((el) => {
      try {
        if (!el.paused && !el.ended) {
          el.pause();
          pausedMediaElements.push(el);
        }
      } catch {}
    });

    try {
      document.querySelectorAll("iframe").forEach((iframe) => {
        iframe.contentWindow?.postMessage(
          JSON.stringify({ event: "command", func: "pauseVideo", args: "" }),
          "*"
        );
      });
    } catch {}

    attachPlayBlocker();
  }

  function attachPlayBlocker() {
    if (playBlockerAttached) return;
    playBlockerAttached = true;
    window.addEventListener("play", onMediaPlayAttempt, true);
  }

  function detachPlayBlocker() {
    if (!playBlockerAttached) return;
    playBlockerAttached = false;
    window.removeEventListener("play", onMediaPlayAttempt, true);
  }

  function onMediaPlayAttempt(event) {
    try {
      if (event.target && typeof event.target.pause === "function") {
        event.target.pause();
      }
    } catch {}
  }

  function resumePausedMedia() {
    detachPlayBlocker();
    pausedMediaElements.forEach((el) => {
      try {
        el.play();
      } catch {}
    });
    pausedMediaElements = [];
  }

  function showReminderPopup(reminder) {
    activeReminderRuleId = reminder.ruleId;
    pauseAllMedia();
    ensureReminderStyle();

    const overlay = document.createElement("div");
    overlay.id = REMINDER_OVERLAY_ID;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "fg-reminder-title");

    const modal = document.createElement("div");
    modal.className = "fg-reminder-modal";

    const badge = document.createElement("div");
    badge.className = "fg-reminder-badge";
    badge.textContent = "Take a break";

    const title = document.createElement("h2");
    title.id = "fg-reminder-title";
    title.className = "fg-reminder-title";
    title.textContent = "Time for a break!";

    const desc = document.createElement("p");
    desc.className = "fg-reminder-desc";
    const siteName = reminder.name || reminder.host || "this website";
    const minutes = reminder.minutes;
    const minutesLabel = `${minutes} minute${minutes === 1 ? "" : "s"}`;
    desc.append("You've been on ");
    const strongSite = document.createElement("strong");
    strongSite.textContent = siteName;
    desc.append(strongSite);
    desc.append(" for ");
    const strongTime = document.createElement("strong");
    strongTime.textContent = minutesLabel;
    desc.append(strongTime);
    desc.append(".");

    const customMessage = document.createElement("p");
    customMessage.className = "fg-reminder-custom";
    customMessage.textContent = reminder.message
      ? reminder.message
      : `Step away, rest your eyes, and take a breather from ${siteName}.`;

    const actions = document.createElement("div");
    actions.className = "fg-reminder-actions";

    const breakBtn = document.createElement("button");
    breakBtn.type = "button";
    breakBtn.className = "fg-reminder-btn fg-btn-primary";
    breakBtn.textContent = "Take a break";
    breakBtn.addEventListener("click", () => {
      dismissReminder(reminder.ruleId);
    });

    const resumeBtn = document.createElement("button");
    resumeBtn.type = "button";
    resumeBtn.className = "fg-reminder-btn fg-btn-secondary";
    resumeBtn.textContent = "Resume & dismiss";
    resumeBtn.addEventListener("click", () => {
      resumePausedMedia();
      dismissReminder(reminder.ruleId);
    });

    const snoozeBtn = document.createElement("button");
    snoozeBtn.type = "button";
    snoozeBtn.className = "fg-reminder-btn fg-btn-tertiary";
    snoozeBtn.textContent = "Snooze (5m)";
    snoozeBtn.addEventListener("click", () => {
      snoozeReminder(reminder.ruleId);
    });

    actions.append(breakBtn, resumeBtn, snoozeBtn);
    modal.append(badge, title, desc, customMessage, actions);
    overlay.append(modal);

    if (escapeKeyHandler) {
      window.removeEventListener("keydown", escapeKeyHandler);
    }
    escapeKeyHandler = (e) => {
      if (e.key === "Escape") {
        dismissReminder(reminder.ruleId);
      }
    };
    window.addEventListener("keydown", escapeKeyHandler);

    document.documentElement.append(overlay);
  }

  function hideReminderPopup() {
    document.getElementById(REMINDER_OVERLAY_ID)?.remove();
    activeReminderRuleId = null;
    detachPlayBlocker();
    if (escapeKeyHandler) {
      window.removeEventListener("keydown", escapeKeyHandler);
      escapeKeyHandler = null;
    }
  }

  async function dismissReminder(ruleId) {
    hideReminderPopup();
    try {
      await chrome.runtime.sendMessage({
        type: "FOCUS_GUARD_DISMISS_REMINDER",
        ruleId,
      });
    } catch {}
  }

  async function snoozeReminder(ruleId) {
    hideReminderPopup();
    try {
      await chrome.runtime.sendMessage({
        type: "FOCUS_GUARD_SNOOZE_REMINDER",
        ruleId,
        minutes: 5,
      });
    } catch {}
  }

  function ensureReminderStyle() {
    if (document.getElementById(REMINDER_STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = REMINDER_STYLE_ID;
    style.textContent = `
      #${REMINDER_OVERLAY_ID} {
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483647 !important;
        background: rgba(33, 17, 17, 0.72) !important;
        backdrop-filter: blur(6px) !important;
        -webkit-backdrop-filter: blur(6px) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 16px !important;
        box-sizing: border-box !important;
        animation: fgFadeIn 0.2s ease-out !important;
      }

      @keyframes fgFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .fg-reminder-modal {
        background: #fff7f3 !important;
        color: #211111 !important;
        border: 1px solid #ead7d0 !important;
        border-radius: 12px !important;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.36) !important;
        max-width: 440px !important;
        width: 100% !important;
        padding: 26px 24px !important;
        text-align: center !important;
        box-sizing: border-box !important;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }

      @media (prefers-color-scheme: dark) {
        .fg-reminder-modal {
          background: #2b1a1a !important;
          color: #fff7f3 !important;
          border-color: #5a3333 !important;
        }
      }

      .fg-reminder-badge {
        display: inline-block !important;
        padding: 4px 12px !important;
        border-radius: 999px !important;
        background: rgba(127, 29, 29, 0.12) !important;
        color: #7f1d1d !important;
        font-size: 12px !important;
        font-weight: 700 !important;
        letter-spacing: 0.04em !important;
        text-transform: uppercase !important;
        margin-bottom: 12px !important;
      }

      @media (prefers-color-scheme: dark) {
        .fg-reminder-badge {
          background: rgba(239, 154, 154, 0.18) !important;
          color: #ef9a9a !important;
        }
      }

      .fg-reminder-title {
        font-size: 20px !important;
        font-weight: 800 !important;
        line-height: 1.3 !important;
        margin: 0 0 10px !important;
        color: inherit !important;
      }

      .fg-reminder-desc {
        font-size: 15px !important;
        line-height: 1.5 !important;
        color: #765d5d !important;
        margin: 0 0 8px !important;
      }

      @media (prefers-color-scheme: dark) {
        .fg-reminder-desc {
          color: #d4bbb4 !important;
        }
      }

      .fg-reminder-custom {
        font-size: 14px !important;
        line-height: 1.5 !important;
        color: #765d5d !important;
        margin: 0 0 20px !important;
      }

      @media (prefers-color-scheme: dark) {
        .fg-reminder-custom {
          color: #d4bbb4 !important;
        }
      }

      .fg-reminder-actions {
        display: flex !important;
        flex-direction: column !important;
        gap: 8px !important;
      }

      .fg-reminder-btn {
        border: 0 !important;
        border-radius: 8px !important;
        font-family: inherit !important;
        font-size: 13px !important;
        font-weight: 700 !important;
        padding: 10px 16px !important;
        cursor: pointer !important;
        transition: background 0.15s ease, opacity 0.15s ease !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }

      .fg-btn-primary {
        background: #7f1d1d !important;
        color: #fff7f3 !important;
      }

      .fg-btn-primary:hover {
        background: #5f1212 !important;
      }

      @media (prefers-color-scheme: dark) {
        .fg-btn-primary {
          background: #ef9a9a !important;
          color: #211111 !important;
        }
        .fg-btn-primary:hover {
          background: #f5b5b5 !important;
        }
      }

      .fg-btn-secondary {
        background: transparent !important;
        border: 1px solid #ead7d0 !important;
        color: inherit !important;
      }

      .fg-btn-secondary:hover {
        background: rgba(127, 29, 29, 0.08) !important;
      }

      @media (prefers-color-scheme: dark) {
        .fg-btn-secondary {
          border-color: #5a3333 !important;
        }
        .fg-btn-secondary:hover {
          background: rgba(239, 154, 154, 0.12) !important;
        }
      }

      .fg-btn-tertiary {
        background: transparent !important;
        color: #765d5d !important;
        font-size: 12px !important;
        padding: 6px 12px !important;
      }

      .fg-btn-tertiary:hover {
        color: #7f1d1d !important;
      }

      @media (prefers-color-scheme: dark) {
        .fg-btn-tertiary {
          color: #d4bbb4 !important;
        }
        .fg-btn-tertiary:hover {
          color: #ef9a9a !important;
        }
      }
    `;
    document.documentElement.append(style);
  }
})();
