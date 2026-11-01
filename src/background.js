importScripts("shared.js");

const TICK_ALARM = "focusGuardUsageTick";
const MAX_SESSION_MS = 5 * 60 * 1000;
const FOCUS_HEARTBEAT_CAP_MS = 30 * 1000;
let idleState = "active";

chrome.runtime.onInstalled.addListener(async () => {
  if (chrome.sidePanel?.setPanelBehavior) {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (err) {
      console.warn("Could not set side panel behavior on install:", err);
    }
  }
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  const settings = await getSettings();
  await updateExtensionIcon(settings.iconEmoji);
  await updateFocusModeBadge();
  await syncFocusModeSession();
  await refreshActiveSession();
  await enforceAllTabs();
});

chrome.runtime.onStartup.addListener(async () => {
  if (chrome.sidePanel?.setPanelBehavior) {
    try {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (err) {
      console.warn("Could not set side panel behavior on startup:", err);
    }
  }
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  const settings = await getSettings();
  await updateExtensionIcon(settings.iconEmoji);
  await updateFocusModeBadge();
  await syncFocusModeSession();
  await refreshActiveSession();
  await enforceAllTabs();
});

// Configure side panel to open when clicking the toolbar action icon
if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.warn("Could not set side panel behavior:", err);
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (chrome.sidePanel?.open && tab?.windowId) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      return;
    } catch {}
  }
  chrome.runtime.openOptionsPage();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) {
    recordUsageTick().then(recordFocusModeTick).then(enforceAllTabs);
  }
});

chrome.tabs.onActivated.addListener(() => {
  recordUsageTick()
    .then(refreshActiveSession)
    .then(syncFocusModeSession)
    .then(enforceAllTabs);
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    recordUsageTick()
      .then(refreshActiveSession)
      .then(syncFocusModeSession)
      .then(enforceAllTabs);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  recordUsageTick(tabId)
    .then(refreshActiveSession)
    .then(syncFocusModeSession)
    .then(enforceAllTabs);
});

chrome.windows.onFocusChanged.addListener(() => {
  recordUsageTick()
    .then(recordFocusModeTick)
    .then(refreshActiveSession)
    .then(syncFocusModeSession)
    .then(enforceAllTabs);
});

chrome.tabs.onCreated.addListener(() => {
  enforceAllTabs();
});

chrome.tabs.onAttached.addListener(() => {
  enforceAllTabs();
});

chrome.idle.setDetectionInterval(60);
chrome.idle.onStateChanged.addListener((state) => {
  idleState = state;
  recordUsageTick()
    .then(recordFocusModeTick)
    .then(refreshActiveSession)
    .then(syncFocusModeSession);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "FOCUS_GUARD_FLUSH") {
    recordUsageTick().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "FOCUS_GUARD_UPDATE_ICON") {
    updateExtensionIcon(message.emoji)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "FOCUS_GUARD_ENFORCE") {
    getSettings()
      .then((settings) => updateExtensionIcon(settings.iconEmoji))
      .then(updateFocusModeBadge)
      .then(syncFocusModeSession)
      .then(enforceAllTabs)
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "FOCUS_GUARD_FOCUS_FLUSH") {
    recordFocusModeTick()
      .then(syncFocusModeSession)
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "FOCUS_GUARD_TIMER_STATUS") {
    recordUsageTick()
      .then(() => Promise.all([
        getTimerStatus(message.url),
        getReminderStatus(message.url, {
          isVisible: message.isVisible,
          hasMedia: message.hasMedia
        })
      ]))
      .then(([status, reminder]) => sendResponse({ ok: true, status, reminder }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "FOCUS_GUARD_DISMISS_REMINDER") {
    dismissReminder(message.ruleId)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "FOCUS_GUARD_TAKE_BREAK") {
    takeBreakAndCloseTabs(message.ruleId)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "FOCUS_GUARD_SNOOZE_REMINDER") {
    snoozeReminder(message.ruleId, message.minutes)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  return false;
});

async function getActiveHttpTab() {
  const windows = await chrome.windows.getAll({
    populate: true,
    windowTypes: ["normal"],
  });
  const focusedWindow = windows.find((window) => window.focused);
  if (!focusedWindow) return null;

  const tab = focusedWindow.tabs.find((candidate) => candidate.active);
  if (!tab || !getHost(tab.url || "")) return null;
  return tab;
}

async function refreshActiveSession() {
  const tab = idleState === "active" ? await getActiveHttpTab() : null;
  const session = tab
    ? {
        tabId: tab.id,
        host: getHost(tab.url),
        usageKey: getUsageKey(tab.url),
        startedAt: Date.now(),
      }
    : { tabId: null, host: "", startedAt: Date.now() };

  await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE]: session });
}

async function recordUsageTick(removedTabId) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.ACTIVE);
  const session = stored[STORAGE_KEYS.ACTIVE];

  const usageHost = session?.host;
  const usageKey = session?.usageKey || usageHost;
  if (
    !usageHost ||
    !usageKey ||
    (removedTabId && session.tabId !== removedTabId)
  )
    return;

  const now = Date.now();
  const elapsed = Math.min(
    Math.max(0, now - session.startedAt),
    MAX_SESSION_MS,
  );
  if (elapsed < 1000) return;

  const day = todayKey(new Date(now));
  const usage = await getUsage();
  const pathUsage = await getPathUsage();

  usage[day] = usage[day] || {};
  usage[day][usageHost] = (usage[day][usageHost] || 0) + elapsed;

  pathUsage[day] = pathUsage[day] || {};
  pathUsage[day][usageKey] = (pathUsage[day][usageKey] || 0) + elapsed;

  await saveUsage(usage);
  await savePathUsage(pathUsage);
  await chrome.storage.local.set({
    [STORAGE_KEYS.ACTIVE]: { ...session, startedAt: now },
  });
}

let isEnforcing = false;
let needsReenforce = false;

async function enforceAllTabs() {
  if (isEnforcing) {
    needsReenforce = true;
    return;
  }

  isEnforcing = true;
  try {
    do {
      needsReenforce = false;
      await runEnforceAllTabs();
    } while (needsReenforce);
  } finally {
    isEnforcing = false;
  }
}

async function runEnforceAllTabs() {
  const settings = await getSettings();
  const tabs = (await chrome.tabs.query({})).filter((tab) =>
    getHost(tab.url || tab.pendingUrl || ""),
  );

  await enforceFocusMode(tabs, settings.focusMode, settings);
  await enforceAllowedSchedules(tabs, settings.allowedSchedules, settings);
  await enforceTabLimits(tabs, settings.tabLimits, settings);
  await enforceTimeLimits(tabs, settings.timeLimits, settings);
  await enforceGlobalTabLimits(settings);
}

async function enforceFocusMode(tabs, focusMode, settings) {
  if (!focusMode?.enabled || !normalizePatterns(focusMode.patterns).length)
    return;

  const matchingTabs = tabs.filter((tab) =>
    urlMatchesPatterns(tab.url || tab.pendingUrl || "", focusMode.patterns),
  );

  for (const tab of matchingTabs) {
    await closeRestrictedTab(tab, settings);
  }
}

async function enforceAllowedSchedules(tabs, rules, settings) {
  const now = new Date();

  for (const tab of tabs) {
    const tabUrl = tab.url || tab.pendingUrl || "";
    const matchingRule = (rules || []).find((rule) => {
      return (
        rule.enabled !== false &&
        normalizePatterns(rule.patterns).length &&
        urlMatchesPatterns(tabUrl, rule.patterns)
      );
    });

    if (!matchingRule || isWithinAllowedSchedule(matchingRule, now)) continue;

    await closeRestrictedTab(tab, settings);
  }
}

async function syncFocusModeSession() {
  const settings = await getSettings();
  const session = await getFocusSession();
  const canTrack =
    settings.focusMode?.enabled && (await isBrowserActivelyUsed());

  if (canTrack) {
    if (!session?.lastHeartbeatAt) {
      const now = Date.now();
      await saveFocusSession({ startedAt: now, lastHeartbeatAt: now });
    }
    return;
  }

  if (session?.lastHeartbeatAt) {
    await recordFocusModeTick(true);
  }
}

async function updateFocusModeBadge() {
  const settings = await getSettings();
  const enabled = Boolean(settings.focusMode?.enabled);

  await chrome.action.setBadgeText({ text: enabled ? "F" : "" });
  if (enabled) {
    await chrome.action.setBadgeBackgroundColor({ color: "#7f1d1d" });
    await chrome.action.setBadgeTextColor({ color: "#fff7f3" });
  }
}

async function recordFocusModeTick(stop = false) {
  const session = await getFocusSession();
  const lastHeartbeatAt = session?.lastHeartbeatAt || session?.startedAt;
  if (!lastHeartbeatAt) return;

  const now = Date.now();
  if (now <= lastHeartbeatAt) return;

  const elapsed = now - lastHeartbeatAt;
  if (elapsed <= FOCUS_HEARTBEAT_CAP_MS) {
    const usage = addElapsedByDay(await getFocusUsage(), lastHeartbeatAt, now);
    await saveFocusUsage(usage);
  }

  const settings = await getSettings();
  const canContinue =
    settings.focusMode?.enabled && (await isBrowserActivelyUsed());
  if (stop || !canContinue) {
    await chrome.storage.local.remove(STORAGE_KEYS.FOCUS_SESSION);
  } else {
    await saveFocusSession({
      startedAt: session.startedAt || now,
      lastHeartbeatAt: now,
    });
  }
}

async function isBrowserActivelyUsed() {
  if (idleState !== "active") return false;

  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  return windows.some((window) => window.focused);
}

async function enforceTabLimits(tabs, rules, settings) {
  for (const rule of rules || []) {
    if (rule.enabled === false || !Number(rule.limit)) continue;

    const matchingTabs = tabs.filter((tab) =>
      urlMatchesPatterns(tab.url || tab.pendingUrl || "", rule.patterns),
    );
    const groups =
      rule.scope === "each" ? groupTabsByHost(matchingTabs) : [matchingTabs];

    for (const group of groups) {
      const overflow = group.length - Number(rule.limit);
      if (overflow <= 0) continue;

      const tabsToClose = group
        .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))
        .slice(0, overflow);

      for (const tab of tabsToClose) {
        await closeRestrictedTab(tab, settings);
      }

      const scopeLabel =
        rule.scope === "each" ? "per matching website" : "for the whole group";
      notify(
        "Tab limit reached",
        `${rule.name || "A site"} is limited to ${rule.limit} open tab(s) ${scopeLabel}.`,
      );
    }
  }
}

function groupTabsByHost(tabs) {
  const groups = new Map();

  tabs.forEach((tab) => {
    const host = getHost(tab.url || tab.pendingUrl || "");
    groups.set(host, [...(groups.get(host) || []), tab]);
  });

  return [...groups.values()];
}

function isProtectedTab(tab) {
  const url = tab?.url || tab?.pendingUrl || "";
  return url.startsWith(chrome.runtime.getURL(""));
}

function sortTabsToClose(tabs) {
  return [...tabs].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) {
      return a.pinned ? 1 : -1;
    }
    return (b.lastAccessed || 0) - (a.lastAccessed || 0) || (b.id || 0) - (a.id || 0);
  });
}

async function enforceGlobalTabLimits(settings) {
  const maxPerWindow = parseTabLimitInput(settings?.maxTabsPerWindow);
  const maxTotal = parseTabLimitInput(settings?.maxTabsTotal);

  if (!maxPerWindow && !maxTotal) {
    return;
  }

  const windows = await chrome.windows.getAll({
    populate: true,
    windowTypes: ["normal"],
  });

  const closedTabIds = new Set();

  if (maxPerWindow) {
    for (const win of windows) {
      const eligibleTabs = (win.tabs || []).filter(
        (tab) => !isProtectedTab(tab) && !closedTabIds.has(tab.id),
      );
      const overflow = eligibleTabs.length - maxPerWindow;
      if (overflow <= 0) continue;

      const tabsToClose = sortTabsToClose(eligibleTabs).slice(0, overflow);
      for (const tab of tabsToClose) {
        closedTabIds.add(tab.id);
        await safeRemoveTab(tab.id);
      }

      notify(
        "Window tab limit reached",
        `Each window is limited to ${maxPerWindow} open tab(s).`,
      );
    }
  }

  if (maxTotal) {
    const allEligibleTabs = windows
      .flatMap((win) => win.tabs || [])
      .filter((tab) => !isProtectedTab(tab) && !closedTabIds.has(tab.id));

    const overflow = allEligibleTabs.length - maxTotal;
    if (overflow > 0) {
      const tabsToClose = sortTabsToClose(allEligibleTabs).slice(0, overflow);
      for (const tab of tabsToClose) {
        closedTabIds.add(tab.id);
        await safeRemoveTab(tab.id);
      }

      notify(
        "Total tab limit reached",
        `Total open tabs across all windows is limited to ${maxTotal}.`,
      );
    }
  }
}

async function enforceTimeLimits(tabs, rules, settings) {
  const usage = await getUsage();
  const pathUsage = await getPathUsage();

  for (const tab of tabs) {
    const targetUrl = tab.url || tab.pendingUrl || "";
    const matchingRules = (rules || []).filter((rule) => {
      return (
        rule.enabled !== false &&
        Number(rule.minutes) &&
        urlMatchesPatterns(targetUrl, rule.patterns)
      );
    });

    for (const rule of matchingRules) {
      const targetHost = rule.scope === "each" ? getHost(targetUrl) : "";
      const used = periodUsageForTimeRule(
        usage,
        pathUsage,
        rule.patterns,
        rule.period || PERIODS.DAILY,
        new Date(),
        targetHost,
      );
      if (used < Number(rule.minutes) * 60 * 1000) continue;

      await closeRestrictedTab(tab, settings);
      break;
    }
  }
}

async function getTimerStatus(url) {
  if (!(await urlMatchesAnyTimeLimit(url))) return null;

  const settings = await getSettings();
  const usage = await getUsage();
  const pathUsage = await getPathUsage();
  const host = getHost(url || "");
  const matchingRules = (settings.timeLimits || []).filter((rule) => {
    return (
      rule.enabled !== false &&
      Number(rule.minutes) &&
      urlMatchesPatterns(url || "", rule.patterns)
    );
  });

  if (!matchingRules.length) return null;

  const statuses = matchingRules.map((rule) => {
    const limitMs = Number(rule.minutes) * 60 * 1000;
    const targetHost = rule.scope === "each" ? host : "";
    const usedMs = periodUsageForTimeRule(
      usage,
      pathUsage,
      rule.patterns,
      rule.period || PERIODS.DAILY,
      new Date(),
      targetHost,
    );

    return {
      name: rule.name || host,
      period: rule.period || PERIODS.DAILY,
      scope: rule.scope || "group",
      limitMs,
      usedMs,
      remainingMs: Math.max(0, limitMs - usedMs),
    };
  });

  return statuses.sort((a, b) => a.remainingMs - b.remainingMs)[0];
}

async function urlMatchesAnyTimeLimit(url) {
  const settings = await getSettings();
  return (settings.timeLimits || []).some((rule) => {
    return (
      rule.enabled !== false &&
      Number(rule.minutes) &&
      urlMatchesPatterns(url || "", rule.patterns)
    );
  });
}

async function safeRemoveTab(tabId) {
  try {
    await chrome.tabs.remove(tabId);
  } catch (_error) {
    // Tab may have disappeared between query and remove.
  }
}

async function closeRestrictedTab(tab, settings) {
  const tabId = typeof tab === "object" ? tab.id : tab;
  let windowId = typeof tab === "object" ? tab.windowId : null;

  if (!tabId) return;

  try {
    if (!windowId) {
      const tabInfo = await chrome.tabs.get(tabId);
      windowId = tabInfo?.windowId;
    } else {
      await chrome.tabs.get(tabId);
    }
  } catch (_err) {
    // Tab already closed or gone
    return;
  }

  let isOnlyTabInWindow = false;
  if (windowId) {
    try {
      const windowTabs = await chrome.tabs.query({ windowId });
      isOnlyTabInWindow = windowTabs.length === 1 && windowTabs[0].id === tabId;
    } catch (_err) {
      isOnlyTabInWindow = false;
    }
  }

  if (isOnlyTabInWindow) {
    const activeSettings = settings || (await getSettings());
    const maxTotal = parseTabLimitInput(activeSettings?.maxTabsTotal);
    const maxPerWindow = parseTabLimitInput(activeSettings?.maxTabsPerWindow);

    let canKeepEmptyTab = true;

    // Window tab limit check
    if (maxPerWindow && maxPerWindow < 1) {
      canKeepEmptyTab = false;
    }

    // Global total tab limit check:
    // If the current eligible tab count across all windows already exceeds maxTotal,
    // converting this tab to an empty open tab would violate the total tab limit.
    if (canKeepEmptyTab && maxTotal) {
      try {
        const windows = await chrome.windows.getAll({
          populate: true,
          windowTypes: ["normal"],
        });
        const allEligibleTabs = windows
          .flatMap((win) => win.tabs || [])
          .filter((t) => !isProtectedTab(t));
        if (allEligibleTabs.length > maxTotal) {
          canKeepEmptyTab = false;
        }
      } catch (_err) {
        canKeepEmptyTab = false;
      }
    }

    if (canKeepEmptyTab) {
      try {
        const createProps = { windowId, active: true };
        if (typeof tab === "object" && typeof tab.index === "number") {
          createProps.index = tab.index;
        }
        await chrome.tabs.create(createProps);
        await safeRemoveTab(tabId);
        return;
      } catch (_err) {
        try {
          await chrome.tabs.update(tabId, { url: "about:blank" });
          return;
        } catch (_e) {
          // Fallback to safe remove below
        }
      }
    }
  }

  await safeRemoveTab(tabId);
}

async function getReminderStatus(url, { isVisible = true, hasMedia = false } = {}) {
  if (!url || !getHost(url)) return null;

  const settings = await getSettings();
  const matchingRules = (settings.reminders || []).filter((rule) => {
    return (
      rule.enabled !== false &&
      Number(rule.minutes) > 0 &&
      normalizePatterns(rule.patterns).length > 0 &&
      urlMatchesPatterns(url, rule.patterns)
    );
  });

  if (!matchingRules.length) return null;

  const reminderState = await getReminderState();
  const now = Date.now();
  let activeRule = null;
  let activeState = null;

  for (const rule of matchingRules) {
    const state = reminderState[rule.id];
    if (state?.triggered) {
      activeRule = rule;
      activeState = state;
      break;
    }
  }

  if (!activeRule) {
    activeRule = matchingRules[0];
    activeState = reminderState[activeRule.id] || {
      elapsedMs: 0,
      lastTickAt: now,
      triggered: false
    };
  }

  const limitMs = Number(activeRule.minutes) * 60 * 1000;
  const timeSinceLast = now - (activeState.lastTickAt || now);

  if (timeSinceLast > 10 * 60 * 1000) {
    activeState.elapsedMs = 0;
    activeState.triggered = false;
    delete activeState.snoozedUntil;
  } else if (idleState === "active" && (isVisible || hasMedia)) {
    if (!activeState.triggered) {
      if (!activeState.snoozedUntil || now >= activeState.snoozedUntil) {
        delete activeState.snoozedUntil;
        const increment = Math.min(Math.max(0, timeSinceLast), 2000);
        activeState.elapsedMs = (activeState.elapsedMs || 0) + increment;
      }
    }
  }

  activeState.lastTickAt = now;

  if (activeState.snoozedUntil && now >= activeState.snoozedUntil) {
    delete activeState.snoozedUntil;
    activeState.triggered = true;
  } else if (!activeState.snoozedUntil && activeState.elapsedMs >= limitMs) {
    activeState.triggered = true;
  }

  reminderState[activeRule.id] = activeState;
  await saveReminderState(reminderState);

  const host = getHost(url);
  return {
    ruleId: activeRule.id,
    name: activeRule.name || host,
    minutes: Number(activeRule.minutes),
    message: activeRule.message || "",
    host,
    elapsedMs: activeState.elapsedMs,
    limitMs,
    shouldTrigger: Boolean(activeState.triggered)
  };
}

async function dismissReminder(ruleId) {
  if (!ruleId) return;
  const reminderState = await getReminderState();
  if (reminderState[ruleId]) {
    reminderState[ruleId].elapsedMs = 0;
    reminderState[ruleId].triggered = false;
    reminderState[ruleId].lastTickAt = Date.now();
    delete reminderState[ruleId].snoozedUntil;
    await saveReminderState(reminderState);
  }
}

async function takeBreakAndCloseTabs(ruleId) {
  await dismissReminder(ruleId);

  const settings = await getSettings();
  const rule = (settings.reminders || []).find((candidate) => candidate.id === ruleId);
  if (!rule || !normalizePatterns(rule.patterns).length) return;

  const allTabs = await chrome.tabs.query({});
  const tabsToClose = allTabs.filter(
    (tab) => !isProtectedTab(tab) && urlMatchesPatterns(tab.url || tab.pendingUrl || "", rule.patterns)
  );

  for (const tab of tabsToClose) {
    await closeRestrictedTab(tab, settings);
  }
}

async function snoozeReminder(ruleId, minutes = 5) {
  if (!ruleId) return;
  const reminderState = await getReminderState();
  if (reminderState[ruleId]) {
    reminderState[ruleId].triggered = false;
    reminderState[ruleId].snoozedUntil = Date.now() + (Number(minutes) || 5) * 60 * 1000;
    reminderState[ruleId].lastTickAt = Date.now();
    await saveReminderState(reminderState);
  }
}

function notify(title, message) {
  console.info(`[Aura] ${title}: ${message}`);
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[STORAGE_KEYS.SETTINGS]) {
    const newSettings = changes[STORAGE_KEYS.SETTINGS].newValue;
    const oldSettings = changes[STORAGE_KEYS.SETTINGS].oldValue;
    if (newSettings && newSettings.iconEmoji !== oldSettings?.iconEmoji) {
      updateExtensionIcon(newSettings.iconEmoji);
    }
  }
});

async function loadDefaultIconImageData() {
  const sizes = [16, 32, 48, 128];
  const imageData = {};
  for (const size of sizes) {
    try {
      const url = chrome.runtime.getURL(`icons/${size}.png`);
      const response = await fetch(url);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0, size, size);
      imageData[size] = ctx.getImageData(0, 0, size, size);
    } catch (err) {
      console.warn(`Could not load default icon for size ${size}:`, err);
    }
  }
  return imageData;
}

function createEmojiImageDataSet(emoji) {
  const SIZES = [16, 24, 32, 48, 64, 128];
  const fontFam = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

  // 1. Render emoji at high resolution on intermediate canvas
  const srcSize = 128;
  const srcCanvas = new OffscreenCanvas(srcSize, srcSize);
  const srcCtx = srcCanvas.getContext("2d");
  srcCtx.font = `100px ${fontFam}`;
  srcCtx.textAlign = "center";
  srcCtx.textBaseline = "middle";
  srcCtx.fillText(emoji, srcSize / 2, srcSize / 2);

  // 2. Scan actual pixel alpha bounding box to trim font margins
  const imgData = srcCtx.getImageData(0, 0, srcSize, srcSize);
  const data = imgData.data;
  let minX = srcSize;
  let minY = srcSize;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < srcSize; y++) {
    const rowOffset = y * srcSize * 4;
    for (let x = 0; x < srcSize; x++) {
      if (data[rowOffset + x * 4 + 3] > 15) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const result = {};

  // If no colored pixels were detected (font fallback issue), do direct render fallback
  if (maxX < minX || maxY < minY) {
    for (const size of SIZES) {
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext("2d");
      ctx.font = `${Math.round(size * 1.2)}px ${fontFam}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, size / 2, size / 2);
      result[size] = ctx.getImageData(0, 0, size, size);
    }
    return result;
  }

  // 3. Crop tightly to visible pixels and scale to fill ~98% of the icon tile
  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  for (const size of SIZES) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const targetDim = size * 0.98;
    const scale = Math.min(targetDim / cropW, targetDim / cropH);
    const destW = cropW * scale;
    const destH = cropH * scale;
    const destX = (size - destW) / 2;
    const destY = (size - destH) / 2;

    ctx.drawImage(srcCanvas, minX, minY, cropW, cropH, destX, destY, destW, destH);
    result[size] = ctx.getImageData(0, 0, size, size);
  }

  return result;
}

async function updateExtensionIcon(emoji) {
  const trimmed = typeof emoji === "string" ? emoji.trim() : "";
  if (!trimmed) {
    try {
      const defaultImageData = await loadDefaultIconImageData();
      if (Object.keys(defaultImageData).length > 0) {
        await chrome.action.setIcon({ imageData: defaultImageData });
      } else {
        await chrome.action.setIcon({
          path: {
            16: "icons/16.png",
            32: "icons/32.png",
            48: "icons/48.png",
            128: "icons/128.png"
          }
        });
      }
    } catch (err) {
      console.warn("Failed to reset extension icon to default:", err);
    }
    return;
  }

  try {
    const imageData = createEmojiImageDataSet(trimmed);
    await chrome.action.setIcon({ imageData });
  } catch (err) {
    console.warn("Failed to set extension icon to emoji:", err);
  }
}

// Initialize icon on worker startup if an emoji is already configured
getSettings().then((settings) => {
  if (settings.iconEmoji) {
    updateExtensionIcon(settings.iconEmoji);
  }
});

