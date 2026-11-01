const COLORS = [
  "#ef4444", "#3b82f6", "#10b981", "#f59e0b",
  "#8b5cf6", "#06b6d4", "#f97316", "#84cc16",
  "#ec4899", "#6366f1", "#14b8a6", "#a855f7"
];
const chartInstances = {};

function getChartTheme() {
  const isDark = document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);

  return {
    isDark,
    textColor: isDark ? "#d4bbb4" : "#765d5d",
    gridColor: isDark ? "rgba(90, 51, 51, 0.45)" : "rgba(234, 215, 208, 0.65)",
    lineColor: isDark ? "#ef9a9a" : "#7f1d1d",
    cardBg: isDark ? "#2b1a1a" : "#ffffff",
    tooltipBg: isDark ? "#1f1212" : "#2a1212",
    tooltipText: "#fff7f3",
    tooltipBorder: isDark ? "#5a3333" : "#3f1d1d"
  };
}

function hexToRgba(hex, alpha) {
  if (!hex || !hex.startsWith("#")) {
    return `rgba(127, 29, 29, ${alpha})`;
  }
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
let settings = DEFAULT_SETTINGS;
let todos = [];
let tagColors = {};
let notes = [];
let lists = [];
let draftTodoInput = null;
let draftTodoCleanup = null;
let focusStatsTimer = null;
let tagColorControl = null;
let tagColorControlTarget = null;
let tagColorHideTimer = null;

let focusWeekOffset = 0;
let dailyUsageWeekOffset = 0;
let cachedFocusUsageData = null;
let cachedUsageData = null;

const EMOJI_LIST = [
  { emoji: "🎯", tags: "target focus aim bullseye" },
  { emoji: "⚡", tags: "lightning bolt energy flash fast electric" },
  { emoji: "🔥", tags: "fire flame hot streak" },
  { emoji: "🧠", tags: "brain mind think smart focus" },
  { emoji: "💡", tags: "idea lightbulb bulb creative inspiration" },
  { emoji: "🚀", tags: "rocket space launch ship boost" },
  { emoji: "⏱️", tags: "stopwatch timer time clock" },
  { emoji: "⏳", tags: "hourglass time sand wait timer" },
  { emoji: "🔔", tags: "bell alert notification ring" },
  { emoji: "🛡️", tags: "shield protect guard security aura" },
  { emoji: "💻", tags: "laptop computer tech code work developer" },
  { emoji: "📚", tags: "books study read school learn library" },
  { emoji: "📖", tags: "book open read story literature" },
  { emoji: "✏️", tags: "pencil write note draw edit" },
  { emoji: "📝", tags: "memo note document paper write task" },
  { emoji: "📊", tags: "chart graph stats analysis data" },
  { emoji: "💼", tags: "briefcase business work job office" },
  { emoji: "🎧", tags: "headphones music listen audio podcast focus" },
  { emoji: "☕", tags: "coffee cup tea mug morning caffeinated drink" },
  { emoji: "🍵", tags: "tea green matcha drink warm" },
  { emoji: "🌿", tags: "herb leaf plant green nature branch sprout" },
  { emoji: "🌲", tags: "tree pine evergreen forest nature woods" },
  { emoji: "🌸", tags: "flower cherry blossom sakura pink nature" },
  { emoji: "🌊", tags: "wave water ocean sea blue calm" },
  { emoji: "🌙", tags: "moon crescent night dark sleep evening" },
  { emoji: "☀️", tags: "sun sunny bright light day morning" },
  { emoji: "🪴", tags: "plant potted houseplant leaf green" },
  { emoji: "🍀", tags: "clover four leaf luck lucky green" },
  { emoji: "🪐", tags: "saturn planet space ring cosmos" },
  { emoji: "💎", tags: "diamond gem jewel shine precious crystal" },
  { emoji: "✨", tags: "sparkles sparkle star magic shine clean" },
  { emoji: "⭐", tags: "star yellow gold favorite rating" },
  { emoji: "🏆", tags: "trophy award winner champion cup gold" },
  { emoji: "🥇", tags: "first medal gold winner 1st prize" },
  { emoji: "🧘", tags: "meditation yoga zen calm breathe peace" },
  { emoji: "🧊", tags: "ice cube cold chill frozen" },
  { emoji: "🫧", tags: "bubbles bubble water clean soap" },
  { emoji: "🦉", tags: "owl bird night wise smart nature" },
  { emoji: "🦊", tags: "fox animal cute orange smart" },
  { emoji: "🐱", tags: "cat kitten kitty pet animal cute" },
  { emoji: "🐶", tags: "dog puppy pet animal friend cute" },
  { emoji: "🦁", tags: "lion brave wild animal cat king" },
  { emoji: "🐼", tags: "panda bear cute animal calm" },
  { emoji: "🐻", tags: "bear animal forest cute" },
  { emoji: "🐺", tags: "wolf wild pack animal nature" },
  { emoji: "🐬", tags: "dolphin ocean sea swim animal" },
  { emoji: "🐝", tags: "bee honey insect busy worker" },
  { emoji: "🦋", tags: "butterfly nature insect wing pretty" },
  { emoji: "🍅", tags: "tomato pomodoro focus timer red fruit" },
  { emoji: "🥑", tags: "avocado fruit healthy food green" },
  { emoji: "🍎", tags: "apple red fruit food teacher health" },
  { emoji: "🍊", tags: "orange citrus fruit food fresh" },
  { emoji: "🍉", tags: "watermelon melon fruit food summer" }
];

document.addEventListener("DOMContentLoaded", initOptions);

const DEFAULT_SCHEDULE_DAYS = [1, 2, 3, 4, 5];

async function initOptions() {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    try {
      await applyStoredTheme();
      await sendRuntimeMessage({ type: "FOCUS_GUARD_FLUSH" });
      settings = await getSettings();
    } catch {
      settings = DEFAULT_SETTINGS;
    }
  } else {
    settings = DEFAULT_SETTINGS;
  }
  document.getElementById("themeMode").value = settings.theme || "system";

  const emojiDisplay = document.getElementById("emojiDisplay");
  const emojiPickerBtn = document.getElementById("emojiPickerBtn");
  const clearIconEmojiBtn = document.getElementById("clearIconEmoji");
  const emojiPopup = document.getElementById("emojiPopup");
  const emojiSearchInput = document.getElementById("emojiSearchInput");
  const emojiDefaultBtn = document.getElementById("emojiDefaultBtn");

  const updateEmojiDisplay = (val) => {
    const trimmed = val ? val.trim() : "";
    if (!emojiDisplay || !emojiPickerBtn) return;
    if (trimmed) {
      emojiDisplay.textContent = trimmed;
      emojiPickerBtn.classList.add("has-custom-emoji");
      emojiPickerBtn.title = `Toolbar icon: ${trimmed} (Click to change, hover cross to reset)`;
    } else {
      emojiDisplay.innerHTML = '<img src="../icons/32.png" alt="Default icon" class="default-icon-img">';
      emojiPickerBtn.classList.remove("has-custom-emoji");
      emojiPickerBtn.title = "Default toolbar icon (Click to choose emoji)";
    }
  };

  const handleEmojiChange = async (val) => {
    const trimmed = val ? val.trim() : "";
    settings.iconEmoji = trimmed;
    updateEmojiDisplay(trimmed);
    await persistSettings(false);
    await sendRuntimeMessage({ type: "FOCUS_GUARD_UPDATE_ICON", emoji: trimmed });
  };

  const openEmojiPopup = () => {
    if (!emojiPopup) return;
    emojiPopup.hidden = false;
    if (emojiPickerBtn) emojiPickerBtn.setAttribute("aria-expanded", "true");
    if (emojiSearchInput) {
      emojiSearchInput.value = "";
      renderEmojiGrid("");
      setTimeout(() => emojiSearchInput.focus(), 50);
    }
  };

  const closeEmojiPopup = () => {
    if (!emojiPopup || emojiPopup.hidden) return;
    emojiPopup.hidden = true;
    if (emojiPickerBtn) emojiPickerBtn.setAttribute("aria-expanded", "false");
  };

  const toggleEmojiPopup = () => {
    if (emojiPopup && !emojiPopup.hidden) {
      closeEmojiPopup();
    } else {
      openEmojiPopup();
    }
  };

  const renderEmojiGrid = (filterText = "") => {
    const grid = document.getElementById("emojiGrid");
    if (!grid) return;
    grid.replaceChildren();

    const query = filterText.toLowerCase().trim();

    if (query && /\p{Extended_Pictographic}/u.test(query)) {
      const rawMatch = query.match(/\p{Extended_Pictographic}+/u);
      if (rawMatch) {
        const customEmoji = rawMatch[0];
        const customBtn = document.createElement("button");
        customBtn.type = "button";
        customBtn.className = "emoji-item-btn";
        customBtn.textContent = customEmoji;
        customBtn.title = `Use ${customEmoji}`;
        customBtn.addEventListener("click", () => {
          handleEmojiChange(customEmoji);
          closeEmojiPopup();
        });
        grid.appendChild(customBtn);
      }
    }

    const matches = EMOJI_LIST.filter((item) => {
      if (!query) return true;
      return item.emoji === query || item.tags.toLowerCase().includes(query);
    });

    if (matches.length === 0 && !grid.hasChildNodes()) {
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "emoji-empty-msg";
      emptyMsg.textContent = "No matching emoji found. Type/paste any emoji above!";
      grid.appendChild(emptyMsg);
      return;
    }

    matches.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "emoji-item-btn";
      btn.textContent = item.emoji;
      btn.title = item.emoji;
      btn.addEventListener("click", () => {
        handleEmojiChange(item.emoji);
        closeEmojiPopup();
      });
      grid.appendChild(btn);
    });
  };

  if (emojiPickerBtn) {
    updateEmojiDisplay(settings.iconEmoji || "");

    emojiPickerBtn.addEventListener("click", (e) => {
      if (e.target.closest("#clearIconEmoji")) return;
      toggleEmojiPopup();
    });

    emojiPickerBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleEmojiPopup();
      }
    });

    if (clearIconEmojiBtn) {
      clearIconEmojiBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleEmojiChange("");
        closeEmojiPopup();
      });
    }

    if (emojiSearchInput) {
      emojiSearchInput.addEventListener("input", (e) => {
        renderEmojiGrid(e.target.value);
      });
      emojiSearchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && emojiSearchInput.value.trim()) {
          const val = emojiSearchInput.value.trim();
          if (/\p{Extended_Pictographic}/u.test(val)) {
            const rawMatch = val.match(/\p{Extended_Pictographic}+/u);
            if (rawMatch) {
              handleEmojiChange(rawMatch[0]);
              closeEmojiPopup();
            }
          }
        }
      });
    }

    if (emojiDefaultBtn) {
      emojiDefaultBtn.addEventListener("click", () => {
        handleEmojiChange("");
        closeEmojiPopup();
      });
    }

    document.addEventListener("click", (e) => {
      const pickerGroup = document.getElementById("emojiPickerGroup");
      if (pickerGroup && !pickerGroup.contains(e.target)) {
        closeEmojiPopup();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeEmojiPopup();
      }
    });
  }

  const focusPrevBtn = document.getElementById("focusPrevWeek");
  const focusNextBtn = document.getElementById("focusNextWeek");
  if (focusPrevBtn) {
    focusPrevBtn.addEventListener("click", () => {
      focusWeekOffset++;
      renderFocusGraph();
    });
  }
  if (focusNextBtn) {
    focusNextBtn.addEventListener("click", () => {
      if (focusWeekOffset > 0) {
        focusWeekOffset--;
        renderFocusGraph();
      }
    });
  }

  const dailyUsagePrevBtn = document.getElementById("dailyUsagePrevWeek");
  const dailyUsageNextBtn = document.getElementById("dailyUsageNextWeek");
  if (dailyUsagePrevBtn) {
    dailyUsagePrevBtn.addEventListener("click", () => {
      dailyUsageWeekOffset++;
      renderDailyUsageGraph();
    });
  }
  if (dailyUsageNextBtn) {
    dailyUsageNextBtn.addEventListener("click", () => {
      if (dailyUsageWeekOffset > 0) {
        dailyUsageWeekOffset--;
        renderDailyUsageGraph();
      }
    });
  }

  document.getElementById("focusModeEnabled").checked = Boolean(settings.focusMode?.enabled);
  document.getElementById("focusModePatterns").value = settings.focusMode?.patterns || "";

  const perWindowInput = document.getElementById("maxTabsPerWindow");
  const totalInput = document.getElementById("maxTabsTotal");
  if (perWindowInput) {
    perWindowInput.value = settings.maxTabsPerWindow || "";
    perWindowInput.addEventListener("input", () => {
      settings.maxTabsPerWindow = parseTabLimitInput(perWindowInput.value);
      persistSettings();
    });
  }
  if (totalInput) {
    totalInput.value = settings.maxTabsTotal || "";
    totalInput.addEventListener("input", () => {
      settings.maxTabsTotal = parseTabLimitInput(totalInput.value);
      persistSettings();
    });
  }

  document.getElementById("addTabRule").addEventListener("click", () => {
    settings.tabLimits.push({ id: createRuleId(), name: "", patterns: "", limit: 1, scope: "group", enabled: true });
    renderRules();
    persistSettings();
  });

  document.getElementById("addTimeRule").addEventListener("click", () => {
    settings.timeLimits.push({ id: createRuleId(), name: "", patterns: "", minutes: 30, period: PERIODS.DAILY, scope: "group", enabled: true });
    renderRules();
    persistSettings();
  });

  document.getElementById("addScheduleRule").addEventListener("click", () => {
    settings.allowedSchedules = settings.allowedSchedules || [];
    settings.allowedSchedules.push({
      id: createRuleId(),
      name: "",
      patterns: "",
      days: DEFAULT_SCHEDULE_DAYS,
      startTime: "09:00",
      endTime: "17:00",
      enabled: true
    });
    renderRules();
    persistSettings();
  });

  document.getElementById("addReminderRule").addEventListener("click", () => {
    settings.reminders = settings.reminders || [];
    settings.reminders.push({
      id: createRuleId(),
      name: "",
      patterns: "",
      minutes: 20,
      message: "",
      enabled: true
    });
    renderRules();
    persistSettings();
  });

  const today = todayKey();
  document.getElementById("usageStartDate").value = getPeriodStart(PERIODS.WEEKLY);
  document.getElementById("usageEndDate").value = today;
  document.getElementById("usageStartDate").max = today;
  document.getElementById("usageEndDate").max = today;

  document.getElementById("usagePeriod").addEventListener("change", () => {
    syncCustomRangeVisibility();
    renderUsage();
  });
  document.getElementById("usageStartDate").addEventListener("change", renderUsage);
  document.getElementById("usageEndDate").addEventListener("change", renderUsage);
  document.getElementById("themeMode").addEventListener("change", async (event) => {
    settings.theme = event.target.value;
    applyThemeMode(settings.theme);
    await persistSettings(false);
    await renderFocusStats();
    await renderUsage();
  });

  if (typeof matchMedia !== "undefined") {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if ((settings.theme || "system") === "system") {
        renderFocusStats();
        renderUsage();
      }
    });
  }
  document.getElementById("focusModeEnabled").addEventListener("change", persistFocusMode);
  document.getElementById("focusModePatterns").addEventListener("input", persistFocusMode);
  document.getElementById("showRawData").addEventListener("click", toggleRawData);
  document.getElementById("exportRules").addEventListener("click", exportRules);
  document.getElementById("importRules").addEventListener("click", () => document.getElementById("importRulesFile").click());
  document.getElementById("importRulesFile").addEventListener("change", importRules);
  document.getElementById("addTodo").addEventListener("click", startTodoDraft);
  document.getElementById("addNote").addEventListener("click", addNote);
  document.getElementById("addList").addEventListener("click", addList);

  todos = [];
  tagColors = {};
  notes = [];
  lists = [];
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    try {
      todos = await getTodos();
      tagColors = await getTagColors();
      notes = await getNotes();
      lists = await getLists();
    } catch {
      todos = [];
      notes = [];
      lists = [];
    }
  }

  // Setup tab navigation
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.tab);
    });
  });

  const hashTab = location.hash.replace("#", "").toLowerCase();
  const validTabs = ["focus", "analytics", "rules", "settings"];
  const initialTab = validTabs.includes(hashTab)
    ? hashTab
    : (localStorage.getItem("aura_active_tab") || "focus");

  syncCustomRangeVisibility();
  renderRules();
  renderTodos();
  renderNotes();
  renderLists();
  await renderFocusStats();
  focusStatsTimer = setInterval(renderFocusStats, 1000);
  await renderUsage();

  switchTab(initialTab);
}

function switchTab(tabId) {
  const tabs = [
    { id: "focus", btnId: "tabBtnFocus", paneId: "tab-focus" },
    { id: "analytics", btnId: "tabBtnAnalytics", paneId: "tab-analytics" },
    { id: "rules", btnId: "tabBtnRules", paneId: "tab-rules" },
    { id: "settings", btnId: "tabBtnSettings", paneId: "tab-settings" }
  ];

  const matched = tabs.find((t) => t.id === tabId);
  const activeTabId = matched ? matched.id : "focus";

  tabs.forEach((tab) => {
    const pane = document.getElementById(tab.paneId);
    const btn = document.getElementById(tab.btnId);
    const isActive = tab.id === activeTabId;

    if (pane) {
      pane.hidden = !isActive;
      pane.classList.toggle("active", isActive);
    }
    if (btn) {
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
    }
  });

  try {
    localStorage.setItem("aura_active_tab", activeTabId);
  } catch {}

  // Resize and refresh charts when switching to tabs containing charts
  if (activeTabId === "analytics") {
    setTimeout(() => {
      renderUsage();
      const pie = chartInstances["pieChartCanvas"];
      const daily = chartInstances["dailyUsageCanvas"];
      if (pie) pie.resize();
      if (daily) daily.resize();
    }, 40);
  } else if (activeTabId === "focus") {
    setTimeout(() => {
      renderFocusStats();
      const focusChart = chartInstances["focusGraphCanvas"];
      if (focusChart) focusChart.resize();
    }, 40);
  }
}

function renderRules() {
  renderRuleList("tabRules", "tabRuleTemplate", settings.tabLimits, readTabRule);
  renderRuleList("timeRules", "timeRuleTemplate", settings.timeLimits, readTimeRule);
  renderRuleList("scheduleRules", "scheduleRuleTemplate", settings.allowedSchedules || [], readScheduleRule, fillScheduleRuleForm);
  renderRuleList("reminderRules", "reminderRuleTemplate", settings.reminders || [], readReminderRule);
}

function renderRuleList(containerId, templateId, rules, readRule, fillRule = fillForm) {
  const container = document.getElementById(containerId);
  const template = document.getElementById(templateId);
  container.replaceChildren();

  if (!rules.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No rules yet.";
    container.append(empty);
    return;
  }

  rules.forEach((rule) => {
    const form = template.content.firstElementChild.cloneNode(true);
    form.dataset.id = rule.id;
    fillRule(form, rule);

    form.addEventListener("input", () => {
      Object.assign(rule, readRule(form));
      persistSettings();
    });

    form.querySelector("[data-remove]").addEventListener("click", (event) => {
      const button = event.currentTarget;

      if (button.dataset.confirming !== "true") {
        button.dataset.confirming = "true";
        button.classList.add("confirm-remove");
        button.textContent = "Confirm?";
        setTimeout(() => resetRemoveButton(button), 3000);
        return;
      }

      const index = rules.findIndex((candidate) => candidate.id === rule.id);
      if (index >= 0) rules.splice(index, 1);
      renderRules();
      persistSettings();
    });

    container.append(form);
  });
}

function resetRemoveButton(button) {
  if (!button.isConnected || button.dataset.confirming !== "true") return;

  button.dataset.confirming = "false";
  button.classList.remove("confirm-remove");
  button.textContent = "Remove";
}

function confirmIconRemove(button, remove) {
  if (button.dataset.confirming !== "true") {
    button.dataset.confirming = "true";
    button.classList.add("confirm-remove");
    button.textContent = "?";
    setTimeout(() => resetIconRemoveButton(button), 3000);
    return;
  }

  remove();
}

function resetIconRemoveButton(button) {
  if (!button.isConnected || button.dataset.confirming !== "true") return;

  button.dataset.confirming = "false";
  button.classList.remove("confirm-remove");
  button.textContent = "×";
}

function fillForm(form, rule) {
  Object.entries(rule).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field) return;
    if (typeof field.length === "number" && !field.tagName) return;
    if (field.type === "checkbox") field.checked = value !== false;
    else field.value = value ?? "";
  });
}

function fillScheduleRuleForm(form, rule) {
  fillForm(form, rule);
  const days = Array.isArray(rule.days) ? rule.days.map(String) : [];
  form.querySelectorAll('input[name="days"]').forEach((field) => {
    field.checked = days.includes(field.value);
  });
}

function readTabRule(form) {
  return {
    id: form.dataset.id,
    name: form.elements.name.value.trim(),
    patterns: form.elements.patterns.value.trim(),
    limit: Number(form.elements.limit.value),
    scope: form.elements.scope.value,
    enabled: form.elements.enabled.checked
  };
}

function readTimeRule(form) {
  return {
    id: form.dataset.id,
    name: form.elements.name.value.trim(),
    patterns: form.elements.patterns.value.trim(),
    minutes: Number(form.elements.minutes.value),
    period: form.elements.period.value,
    scope: form.elements.scope.value,
    enabled: form.elements.enabled.checked
  };
}

function readScheduleRule(form) {
  return {
    id: form.dataset.id,
    name: form.elements.name.value.trim(),
    patterns: form.elements.patterns.value.trim(),
    days: [...form.querySelectorAll('input[name="days"]:checked')].map((field) => Number(field.value)),
    startTime: form.elements.startTime.value,
    endTime: form.elements.endTime.value,
    enabled: form.elements.enabled.checked
  };
}

function readReminderRule(form) {
  return {
    id: form.dataset.id,
    name: form.elements.name.value.trim(),
    patterns: form.elements.patterns.value.trim(),
    minutes: Number(form.elements.minutes.value),
    message: form.elements.message ? form.elements.message.value.trim() : "",
    enabled: form.elements.enabled.checked
  };
}

async function persistSettings(enforce = true) {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await saveSettings(settings);
    if (enforce) await sendRuntimeMessage({ type: "FOCUS_GUARD_ENFORCE" });
  }
}

async function persistFocusMode() {
  settings.focusMode = {
    enabled: document.getElementById("focusModeEnabled").checked,
    patterns: document.getElementById("focusModePatterns").value.trim()
  };

  await persistSettings();
  await sendRuntimeMessage({ type: "FOCUS_GUARD_FOCUS_FLUSH" });
  await renderFocusStats();
}

async function renderFocusStats() {
  let usage = {};
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await sendRuntimeMessage({ type: "FOCUS_GUARD_FOCUS_FLUSH" });
    usage = await getFocusUsage();
  } else if (cachedFocusUsageData) {
    usage = cachedFocusUsageData;
  }
  cachedFocusUsageData = usage;
  const today = todayKey();
  const todayMs = usage[today] || 0;

  document.getElementById("focusToday").textContent = formatDuration(todayMs);
  renderFocusGraph(usage);
}

function renderFocusGraph(usage = cachedFocusUsageData || {}) {
  cachedFocusUsageData = usage;
  const days = getSevenDateKeys(focusWeekOffset);
  const values = days.map((day) => usage[day] || 0);

  const rangeLabel = document.getElementById("focusWeekRange");
  if (rangeLabel) rangeLabel.textContent = formatWeekRangeLabel(days, focusWeekOffset);
  const nextBtn = document.getElementById("focusNextWeek");
  if (nextBtn) nextBtn.disabled = focusWeekOffset <= 0;

  renderLineChart("focusGraphCanvas", values, days, {
    label: "Focus time",
    weekOffset: focusWeekOffset
  });
}

async function renderUsage() {
  let usage = {};
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    usage = await getUsage();
  } else if (cachedUsageData) {
    usage = cachedUsageData;
  }
  cachedUsageData = usage;
  const { startKey, endKey } = getSelectedUsageRange();
  const totals = {};

  Object.entries(usage).forEach(([dateKey, hosts]) => {
    if (dateKey < startKey || dateKey > endKey) return;
    Object.entries(hosts).forEach(([key, ms]) => {
      const host = splitUsageKey(key).host;
      totals[host] = (totals[host] || 0) + ms;
    });
  });

  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, COLORS.length);
  renderPie(entries);
  renderDailyUsageGraph(usage);
}

function renderDailyUsageGraph(usage = cachedUsageData || {}) {
  cachedUsageData = usage;
  const canvas = document.getElementById("dailyUsageCanvas");
  if (!canvas) return;

  const days = getSevenDateKeys(dailyUsageWeekOffset);
  const values = days.map((day) => {
    const dayData = usage[day] || {};
    return Object.values(dayData).reduce((sum, ms) => sum + (Number(ms) || 0), 0);
  });
  const total = values.reduce((sum, v) => sum + v, 0);
  const totalEl = document.getElementById("dailyUsageTotal");
  if (totalEl) totalEl.textContent = `${formatDuration(total)} total`;

  const rangeLabel = document.getElementById("dailyUsageWeekRange");
  if (rangeLabel) rangeLabel.textContent = formatWeekRangeLabel(days, dailyUsageWeekOffset);
  const nextBtn = document.getElementById("dailyUsageNextWeek");
  if (nextBtn) nextBtn.disabled = dailyUsageWeekOffset <= 0;

  renderLineChart("dailyUsageCanvas", values, days, {
    label: "Browsing time",
    weekOffset: dailyUsageWeekOffset
  });
}

function renderLineChart(canvasId, values, days, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;

  const theme = getChartTheme();
  const primaryColor = options.color || theme.lineColor;

  const labels = days.map((day, i) => {
    const [yr, mo, da] = day.split("-").map(Number);
    const dateObj = new Date(yr, mo - 1, da);
    const isToday = (options.weekOffset === 0 && i === days.length - 1);
    const weekday = isToday ? "Today" : dateObj.toLocaleDateString("en-US", { weekday: "short" });
    const monthShort = dateObj.toLocaleDateString("en-US", { month: "short" });
    return [weekday, `${da} ${monthShort}`];
  });

  const existingChart = chartInstances[canvasId];
  if (existingChart && existingChart._isDark === theme.isDark && existingChart._weekOffset === options.weekOffset) {
    const currentData = existingChart.data.datasets[0].data;
    const hasDataChanged = values.length !== currentData.length || values.some((val, idx) => val !== currentData[idx]);
    if (hasDataChanged) {
      existingChart.data.datasets[0].data = values;
      existingChart.options.scales.y.suggestedMax = Math.max(...values, 60000);
      existingChart.update("none");
    }
    return;
  }

  if (existingChart) {
    existingChart.destroy();
    delete chartInstances[canvasId];
  }

  const ctx = canvas.getContext("2d");
  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: options.label || "Time",
          data: values,
          borderColor: primaryColor,
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          backgroundColor: (context) => {
            const chartArea = context.chart.chartArea;
            if (!chartArea) return "transparent";
            const gradient = context.chart.ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, hexToRgba(primaryColor, 0.35));
            gradient.addColorStop(1, hexToRgba(primaryColor, 0.01));
            return gradient;
          },
          pointBackgroundColor: theme.cardBg,
          pointBorderColor: primaryColor,
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: primaryColor,
          pointHoverBorderColor: theme.cardBg,
          pointHoverBorderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: theme.tooltipBg,
          titleColor: theme.tooltipText,
          bodyColor: theme.tooltipText,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            title: (items) => {
              if (!items.length) return "";
              const idx = items[0].dataIndex;
              const day = days[idx];
              const [yr, mo, da] = day.split("-").map(Number);
              const dateObj = new Date(yr, mo - 1, da);
              const monthShort = dateObj.toLocaleDateString("en-US", { month: "short" });
              const isToday = options.weekOffset === 0 && idx === days.length - 1;
              const weekday = isToday ? "Today" : dateObj.toLocaleDateString("en-US", { weekday: "long" });
              return `${weekday} (${da} ${monthShort})`;
            },
            label: (context) => `${options.label || "Time"}: ${formatDuration(context.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: theme.textColor,
            font: { family: "Inter, ui-sans-serif, system-ui, sans-serif", size: 11, weight: "600" }
          }
        },
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(...values, 60000),
          grid: {
            color: theme.gridColor,
            drawTicks: false
          },
          border: { display: false },
          ticks: {
            color: theme.textColor,
            font: { family: "Inter, ui-sans-serif, system-ui, sans-serif", size: 10 },
            callback: (val) => formatDuration(val),
            maxTicksLimit: 5,
            padding: 8
          }
        }
      }
    }
  });

  chart._isDark = theme.isDark;
  chart._weekOffset = options.weekOffset;
  chartInstances[canvasId] = chart;
}

function getSevenDateKeys(weekOffset = 0) {
  return Array.from({ length: 7 }, (_value, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (weekOffset * 7) - (6 - index));
    return todayKey(date);
  });
}

function formatWeekRangeLabel(days, weekOffset) {
  if (weekOffset === 0) return "This week";
  const [firstYr, firstMo, firstDa] = days[0].split("-").map(Number);
  const [lastYr, lastMo, lastDa] = days[6].split("-").map(Number);
  const firstDate = new Date(firstYr, firstMo - 1, firstDa);
  const lastDate = new Date(lastYr, lastMo - 1, lastDa);
  const firstMoName = firstDate.toLocaleDateString("en-US", { month: "short" });
  const lastMoName = lastDate.toLocaleDateString("en-US", { month: "short" });
  if (firstMoName === lastMoName) {
    return `${firstDa} – ${lastDa} ${firstMoName}`;
  }
  return `${firstDa} ${firstMoName} – ${lastDa} ${lastMoName}`;
}

async function sendRuntimeMessage(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch {
    return null;
  }
}

function syncCustomRangeVisibility() {
  const isCustom = document.getElementById("usagePeriod").value === "custom";
  document.getElementById("customRange").hidden = !isCustom;
}

function getSelectedUsageRange() {
  const period = document.getElementById("usagePeriod").value;
  if (period !== "custom") {
    return { startKey: getPeriodStart(period), endKey: todayKey() };
  }

  const startInput = document.getElementById("usageStartDate");
  const endInput = document.getElementById("usageEndDate");
  let startKey = startInput.value || getPeriodStart(PERIODS.WEEKLY);
  let endKey = endInput.value || todayKey();

  if (startKey > endKey) {
    [startKey, endKey] = [endKey, startKey];
  }

  return { startKey, endKey };
}

function renderPie(entries) {
  const canvas = document.getElementById("pieChartCanvas");
  const emptyState = document.getElementById("pieEmptyState");
  const container = document.getElementById("pieChartContainer");
  const hint = document.getElementById("usageHint");
  const total = entries.reduce((sum, [, ms]) => sum + ms, 0);

  if (chartInstances["pieChartCanvas"]) {
    chartInstances["pieChartCanvas"].destroy();
    delete chartInstances["pieChartCanvas"];
  }

  if (!total || !entries.length) {
    if (emptyState) emptyState.hidden = false;
    if (container) container.hidden = true;
    if (hint) hint.textContent = "No usage tracked for this period.";
    return;
  }

  if (emptyState) emptyState.hidden = true;
  if (container) container.hidden = false;
  if (hint) hint.textContent = `Total time: ${formatDuration(total)}`;

  if (!canvas || typeof Chart === "undefined") return;

  const theme = getChartTheme();
  const ctx = canvas.getContext("2d");

  const chart = new Chart(ctx, {
    type: "pie",
    data: {
      labels: entries.map(([host]) => host),
      datasets: [
        {
          data: entries.map(([, ms]) => ms),
          backgroundColor: COLORS.slice(0, entries.length),
          borderColor: theme.cardBg,
          borderWidth: 2,
          hoverOffset: 10
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: {
        duration: 400
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: theme.tooltipBg,
          titleColor: theme.tooltipText,
          bodyColor: theme.tooltipText,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (context) => {
              const ms = context.parsed;
              const pct = total ? Math.round((ms / total) * 100) : 0;
              return ` ${context.label}: ${formatDuration(ms)} (${pct}%)`;
            }
          }
        }
      }
    }
  });

  chart._isDark = theme.isDark;
  chartInstances["pieChartCanvas"] = chart;
}

async function renderRawData() {
  const rawData = document.getElementById("rawData");
  const data = await chrome.storage.local.get(null);

  rawData.hidden = false;
  rawData.textContent = JSON.stringify(data, null, 2);
}

async function toggleRawData() {
  const rawData = document.getElementById("rawData");
  const button = document.getElementById("showRawData");

  if (!rawData.hidden) {
    rawData.hidden = true;
    button.textContent = "Show raw data";
    return;
  }

  await renderRawData();
  button.textContent = "Hide raw data";
  rawData.scrollIntoView({ behavior: "smooth", block: "start" });
}

function exportRules() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    theme: settings.theme || "system",
    iconEmoji: settings.iconEmoji ?? "",
    maxTabsPerWindow: settings.maxTabsPerWindow ?? null,
    maxTabsTotal: settings.maxTabsTotal ?? null,
    tabLimits: settings.tabLimits || [],
    timeLimits: settings.timeLimits || [],
    allowedSchedules: settings.allowedSchedules || [],
    reminders: settings.reminders || []
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `aura-rules-${todayKey()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  setRulesBackupStatus("Rules exported. Usage data was not included.");
}

async function importRules(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const imported = JSON.parse(await file.text());
    const tabLimits = Array.isArray(imported.tabLimits) ? imported.tabLimits : [];
    const timeLimits = Array.isArray(imported.timeLimits) ? imported.timeLimits : [];
    const allowedSchedules = Array.isArray(imported.allowedSchedules) ? imported.allowedSchedules : [];
    const reminders = Array.isArray(imported.reminders) ? imported.reminders : [];

    if ("maxTabsPerWindow" in imported) {
      settings.maxTabsPerWindow = parseTabLimitInput(imported.maxTabsPerWindow);
      const perWindowInput = document.getElementById("maxTabsPerWindow");
      if (perWindowInput) perWindowInput.value = settings.maxTabsPerWindow || "";
    }
    if ("maxTabsTotal" in imported) {
      settings.maxTabsTotal = parseTabLimitInput(imported.maxTabsTotal);
      const totalInput = document.getElementById("maxTabsTotal");
      if (totalInput) totalInput.value = settings.maxTabsTotal || "";
    }
    if ("iconEmoji" in imported) {
      const emoji = typeof imported.iconEmoji === "string" ? imported.iconEmoji.trim() : "";
      settings.iconEmoji = emoji;
      updateEmojiDisplay(emoji);
      await sendRuntimeMessage({ type: "FOCUS_GUARD_UPDATE_ICON", emoji });
    }

    settings.tabLimits = [...(settings.tabLimits || []), ...tabLimits.map(normalizeImportedRule)];
    settings.timeLimits = [...(settings.timeLimits || []), ...timeLimits.map(normalizeImportedRule)];
    settings.allowedSchedules = [...(settings.allowedSchedules || []), ...allowedSchedules.map(normalizeImportedSchedule)];
    settings.reminders = [...(settings.reminders || []), ...reminders.map(normalizeImportedReminder)];
    renderRules();
    await persistSettings();
    setRulesBackupStatus(`Imported ${tabLimits.length} tab rule(s), ${timeLimits.length} time rule(s), ${allowedSchedules.length} schedule rule(s), and ${reminders.length} reminder rule(s).`);
  } catch (error) {
    setRulesBackupStatus(`Import failed: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function normalizeImportedRule(rule) {
  return {
    ...rule,
    id: createRuleId(),
    enabled: rule.enabled !== false
  };
}

function normalizeImportedReminder(rule) {
  return {
    ...normalizeImportedRule(rule),
    minutes: Number(rule.minutes) || 20,
    message: typeof rule.message === "string" ? rule.message : ""
  };
}

function normalizeImportedSchedule(rule) {
  return {
    ...normalizeImportedRule(rule),
    days: Array.isArray(rule.days) ? rule.days.map(Number).filter((day) => day >= 0 && day <= 6) : DEFAULT_SCHEDULE_DAYS,
    startTime: rule.startTime || "09:00",
    endTime: rule.endTime || "17:00"
  };
}

function setRulesBackupStatus(message) {
  document.getElementById("rulesBackupStatus").textContent = message;
}

function renderTodos() {
  const container = document.getElementById("todoList");
  draftTodoCleanup?.();
  draftTodoInput = null;
  hideTagColorControl();

  if (!todos.length) {
    container.className = "todo-list empty";
    container.textContent = "No tasks yet.";
    return;
  }

  container.className = "todo-list";
  container.replaceChildren(...todos.map(renderTodo));
}

function startTodoDraft() {
  if (draftTodoInput?.isConnected) {
    draftTodoInput.focus();
    return;
  }

  const container = document.getElementById("todoList");
  const row = document.createElement("div");
  const input = document.createElement("input");

  container.className = "todo-list";
  if (!todos.length) container.replaceChildren();

  row.className = "todo-row editing draft";
  input.type = "text";
  input.className = "todo-edit-input";
  input.placeholder = "Write a task or journey";
  input.setAttribute("aria-label", "New task");

  const stopDraftListeners = () => {
    document.removeEventListener("pointerdown", handlePointerDown, true);
    if (draftTodoCleanup === stopDraftListeners) draftTodoCleanup = null;
  };

  const finishDraft = () => {
    stopDraftListeners();
    saveTodoDraft(input);
  };

  function handlePointerDown(event) {
    if (!row.contains(event.target)) finishDraft();
  }

  draftTodoCleanup = stopDraftListeners;
  document.addEventListener("pointerdown", handlePointerDown, true);
  input.addEventListener("blur", finishDraft);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      removeTodoDraft(row);
    }
  });

  row.append(input);
  container.append(row);
  draftTodoInput = input;
  input.focus();
}

async function saveTodoDraft(input) {
  if (!input.isConnected || input.dataset.saving === "true") return;

  const text = input.value.trim();
  if (!text) {
    removeTodoDraft(input.closest(".todo-row"));
    return;
  }

  input.dataset.saving = "true";
  todos.push({ id: createRuleId(), text, done: false });
  await saveTodos(todos);
  renderTodos();
}

function removeTodoDraft(row) {
  draftTodoCleanup?.();
  draftTodoInput = null;
  row?.remove();

  if (!todos.length) {
    renderTodos();
  }
}

function renderTodo(todo) {
  const row = document.createElement("div");
  const actions = document.createElement("div");
  const edit = document.createElement("button");
  const remove = document.createElement("button");
  const steps = getTodoSteps(todo.text);
  const isJourney = steps.length > 1;

  row.className = "todo-row";
  row.draggable = true;
  row.dataset.id = todo.id;
  actions.className = "todo-actions";
  edit.className = "secondary-button";
  edit.type = "button";
  edit.textContent = "Edit";
  remove.className = "icon-button danger";
  remove.type = "button";
  remove.textContent = "×";
  remove.setAttribute("aria-label", `Remove ${todo.text}`);

  edit.addEventListener("click", () => renderTodoEditor(row, todo));
  row.addEventListener("dragstart", handleTodoDragStart);
  row.addEventListener("dragover", handleTodoDragOver);
  row.addEventListener("dragleave", handleTodoDragLeave);
  row.addEventListener("drop", handleTodoDrop);
  row.addEventListener("dragend", handleTodoDragEnd);

  remove.addEventListener("click", () => confirmIconRemove(remove, async () => {
    todos = todos.filter((candidate) => candidate.id !== todo.id);
    await saveTodos(todos);
    renderTodos();
  }));

  const todoContent = isJourney ? renderTodoJourney(todo, steps) : renderTodoTextButton(todo);
  if (!isJourney && todo.done) row.classList.add("completed");
  actions.append(edit, remove);
  row.append(todoContent, actions);
  return row;
}

function handleTodoDragStart(event) {
  event.currentTarget.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", event.currentTarget.dataset.id);
}

function handleTodoDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  event.currentTarget.classList.add("drag-over");
}

function handleTodoDragLeave(event) {
  event.currentTarget.classList.remove("drag-over");
}

async function handleTodoDrop(event) {
  event.preventDefault();
  const draggedId = event.dataTransfer.getData("text/plain");
  const targetId = event.currentTarget.dataset.id;
  event.currentTarget.classList.remove("drag-over");

  if (!draggedId || !targetId || draggedId === targetId) return;

  const draggedIndex = todos.findIndex((todo) => todo.id === draggedId);
  const targetIndex = todos.findIndex((todo) => todo.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0) return;

  const [draggedTodo] = todos.splice(draggedIndex, 1);
  todos.splice(targetIndex, 0, draggedTodo);
  await saveTodos(todos);
  renderTodos();
}

function handleTodoDragEnd() {
  document.querySelectorAll(".todo-row.dragging, .todo-row.drag-over").forEach((row) => {
    row.classList.remove("dragging", "drag-over");
  });
}

function renderTodoTextButton(todo) {
  const text = document.createElement("button");
  text.className = "todo-text-button";
  text.type = "button";
  text.setAttribute("aria-pressed", String(todo.done));
  appendTaggedText(text, todo.text);

  text.addEventListener("click", async () => {
    todo.done = !todo.done;
    delete todo.completedSteps;
    await saveTodos(todos);
    renderTodos();
  });

  return text;
}

function renderTodoJourney(todo, steps) {
  const journey = document.createElement("div");
  journey.className = "todo-journey";
  journey.setAttribute("aria-label", `Journey: ${todo.text}`);

  steps.forEach((step, index) => {
    const stepButton = document.createElement("button");
    const isDone = getTodoStepDone(todo, index);

    stepButton.className = "todo-step-button";
    stepButton.type = "button";
    stepButton.setAttribute("aria-pressed", String(isDone));
    if (isDone) stepButton.classList.add("completed");
    appendTaggedText(stepButton, step);

    stepButton.addEventListener("click", async () => {
      toggleTodoStep(todo, index, steps.length);
      await saveTodos(todos);
      renderTodos();
    });

    journey.append(stepButton);

    if (index < steps.length - 1) {
      const arrow = document.createElement("span");
      arrow.className = "todo-journey-arrow";
      arrow.textContent = "→";
      journey.append(arrow);
    }
  });

  return journey;
}

function getTodoSteps(value) {
  const steps = String(value || "")
    .split(/→|->|𐃘/)
    .map((step) => step.trim())
    .filter(Boolean);

  return steps.length ? steps : [String(value || "").trim()];
}

function getTodoStepDone(todo, index) {
  if (Array.isArray(todo.completedSteps)) return Boolean(todo.completedSteps[index]);
  return Boolean(todo.done);
}

function toggleTodoStep(todo, index, stepCount) {
  const completedSteps = Array.from({ length: stepCount }, (_value, stepIndex) => {
    return getTodoStepDone(todo, stepIndex);
  });

  completedSteps[index] = !completedSteps[index];
  todo.completedSteps = completedSteps;
  todo.done = completedSteps.every(Boolean);
}

function syncTodoCompletionAfterTextChange(todo) {
  const steps = getTodoSteps(todo.text);

  if (steps.length <= 1) {
    delete todo.completedSteps;
    todo.done = Boolean(todo.done);
    return;
  }

  const completedSteps = Array.from({ length: steps.length }, (_value, index) => {
    return getTodoStepDone(todo, index);
  });

  todo.completedSteps = completedSteps;
  todo.done = completedSteps.every(Boolean);
}

function appendTaggedText(container, value) {
  const tagPattern = /#[A-Za-z0-9_-]+/g;
  let cursor = 0;
  let match = tagPattern.exec(value);

  while (match) {
    if (match.index > cursor) {
      appendTodoCopy(container, value.slice(cursor, match.index));
    }

    const tag = document.createElement("span");
    tag.className = "todo-tag";
    tag.dataset.tag = match[0].toLowerCase();
    applyTagColor(tag, tag.dataset.tag);
    tag.addEventListener("pointerenter", () => showTagColorControl(tag));
    tag.addEventListener("focus", () => showTagColorControl(tag));
    tag.textContent = match[0];
    container.append(tag);
    cursor = match.index + match[0].length;
    match = tagPattern.exec(value);
  }

  if (cursor < value.length) {
    appendTodoCopy(container, value.slice(cursor));
  }
}

function appendTodoCopy(container, text) {
  const copy = document.createElement("span");
  copy.className = "todo-copy";
  copy.textContent = text;
  container.append(copy);
}

function applyTagColor(tag, tagKey) {
  const color = tagColors[tagKey];
  if (!color) return;

  tag.style.setProperty("--todo-tag-color", color);
  tag.style.setProperty("--todo-tag-bg", colorToSoftBackground(color));
}

function showTagColorControl(tag) {
  const tagKey = tag.dataset.tag;
  if (!tagKey) return;

  tagColorControlTarget = tag;
  clearTagColorHideTimer();
  if (!tagColorControl) {
    tagColorControl = document.createElement("div");
    tagColorControl.className = "tag-color-control";
    tagColorControl.innerHTML = '<span>Tag color</span><input type="color" aria-label="Tag color">';
    tagColorControl.addEventListener("pointerenter", () => {
      tagColorControl.dataset.hovering = "true";
      clearTagColorHideTimer();
    });
    tagColorControl.addEventListener("pointerleave", () => {
      tagColorControl.dataset.hovering = "false";
      queueHideTagColorControl();
    });
    tagColorControl.querySelector("input").addEventListener("input", updateTagColor);
    document.body.append(tagColorControl);
  }

  tagColorControl.dataset.tag = tagKey;
  tagColorControl.querySelector("input").value = normalizeHexColor(tagColors[tagKey] || "#7f1d1d");

  const rect = tag.getBoundingClientRect();
  const maxLeft = Math.max(8, window.innerWidth - 168);
  tagColorControl.style.left = `${Math.max(8, Math.min(maxLeft, rect.left + window.scrollX))}px`;
  tagColorControl.style.top = `${rect.bottom + window.scrollY + 2}px`;
  tagColorControl.hidden = false;

  tag.addEventListener("pointerleave", queueHideTagColorControl, { once: true });
  tag.addEventListener("blur", queueHideTagColorControl, { once: true });
}

async function updateTagColor(event) {
  const tagKey = tagColorControl?.dataset.tag;
  if (!tagKey) return;

  tagColors[tagKey] = normalizeHexColor(event.target.value);
  document.querySelectorAll(".todo-tag").forEach((tag) => {
    if (tag.dataset.tag === tagKey) applyTagColor(tag, tagKey);
  });
  await saveTagColors(tagColors);
}

function queueHideTagColorControl() {
  clearTagColorHideTimer();
  tagColorHideTimer = setTimeout(() => {
    if (tagColorControl?.dataset.hovering === "true") return;
    if (tagColorControl?.matches(":hover, :focus-within")) return;
    if (tagColorControlTarget?.matches(":hover, :focus")) return;
    hideTagColorControl();
  }, 450);
}

function clearTagColorHideTimer() {
  if (!tagColorHideTimer) return;

  clearTimeout(tagColorHideTimer);
  tagColorHideTimer = null;
}

function hideTagColorControl() {
  if (!tagColorControl) return;

  clearTagColorHideTimer();
  tagColorControl.hidden = true;
  tagColorControlTarget = null;
}

function normalizeHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : "#7f1d1d";
}

function colorToSoftBackground(color) {
  const normalized = normalizeHexColor(color).slice(1);
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, 0.14)`;
}

async function addNote() {
  const bodyInput = document.getElementById("noteBody");
  const body = bodyInput.value.trim();
  if (!body) return;

  notes.unshift({ id: createRuleId(), body, pinned: false, updatedAt: Date.now() });
  bodyInput.value = "";
  await saveNotes(notes);
  renderNotes();
}

function renderNotes() {
  const container = document.getElementById("notesList");
  const sortedNotes = [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.updatedAt || 0) - (a.updatedAt || 0));

  if (!sortedNotes.length) {
    container.className = "notes-list empty";
    container.textContent = "No notes yet.";
    return;
  }

  container.className = "notes-list";
  container.replaceChildren(...sortedNotes.map(renderNote));
}

function renderNote(note) {
  const card = document.createElement("article");
  const header = document.createElement("div");
  const body = document.createElement("p");
  const actions = document.createElement("div");
  const pin = document.createElement("button");
  const edit = document.createElement("button");
  const remove = document.createElement("button");

  card.className = note.pinned ? "note-card pinned" : "note-card";
  header.className = "note-card-header";
  body.textContent = note.body || note.title || "No note text.";
  actions.className = "note-actions";
  pin.type = "button";
  pin.className = "secondary-button";
  pin.textContent = note.pinned ? "Unpin" : "Pin";
  edit.type = "button";
  edit.className = "secondary-button";
  edit.textContent = "Edit";
  remove.type = "button";
  remove.className = "icon-button danger";
  remove.textContent = "×";
  remove.setAttribute("aria-label", "Remove note");

  pin.addEventListener("click", async () => {
    note.pinned = !note.pinned;
    note.updatedAt = Date.now();
    await saveNotes(notes);
    renderNotes();
  });
  edit.addEventListener("click", () => renderNoteEditor(card, note));
  remove.addEventListener("click", () => confirmIconRemove(remove, async () => {
    notes = notes.filter((candidate) => candidate.id !== note.id);
    await saveNotes(notes);
    renderNotes();
  }));

  actions.append(pin, edit, remove);
  header.append(actions);
  card.append(header, body);
  return card;
}

function renderNoteEditor(card, note) {
  const body = document.createElement("textarea");
  const actions = document.createElement("div");
  const save = document.createElement("button");
  const cancel = document.createElement("button");

  body.value = note.body || note.title || "";
  body.placeholder = "Note body";
  actions.className = "note-actions";
  save.type = "button";
  save.textContent = "Save";
  cancel.type = "button";
  cancel.className = "secondary-button";
  cancel.textContent = "Cancel";

  save.addEventListener("click", async () => {
    note.body = body.value.trim();
    delete note.title;
    note.updatedAt = Date.now();
    await saveNotes(notes);
    renderNotes();
  });
  cancel.addEventListener("click", renderNotes);

  actions.append(save, cancel);
  card.className = "note-card editing";
  card.replaceChildren(body, actions);
  body.focus();
}

async function addList() {
  const titleInput = document.getElementById("listTitle");
  const itemsInput = document.getElementById("listItems");
  const title = titleInput.value.trim();
  const items = itemsInput.value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((text) => ({ id: createRuleId(), text }));
  if (!title && !items.length) return;

  lists.unshift({ id: createRuleId(), title: title || "Untitled list", items, updatedAt: Date.now() });
  titleInput.value = "";
  itemsInput.value = "";
  await saveLists(lists);
  renderLists();
}

function renderLists() {
  const container = document.getElementById("listsList");

  if (!lists.length) {
    container.className = "lists-list empty";
    container.textContent = "No lists yet.";
    return;
  }

  container.className = "lists-list";
  container.replaceChildren(...lists.map(renderList));
}

function renderList(list) {
  const card = document.createElement("article");
  const header = document.createElement("div");
  const title = document.createElement("h3");
  const actions = document.createElement("div");
  const addItem = document.createElement("button");
  const edit = document.createElement("button");
  const remove = document.createElement("button");
  const items = document.createElement("ul");
  const listItems = normalizeListItems(list.items);

  card.className = "list-card";
  header.className = "list-card-header";
  title.textContent = list.title;
  actions.className = "list-actions";
  addItem.type = "button";
  addItem.className = "secondary-button";
  addItem.textContent = "Add item";
  edit.type = "button";
  edit.className = "secondary-button";
  edit.textContent = "Edit";
  remove.type = "button";
  remove.className = "icon-button danger";
  remove.textContent = "×";
  remove.setAttribute("aria-label", `Remove ${list.title}`);
  items.className = "list-items";

  listItems.forEach((item) => items.append(renderListItem(item)));
  addItem.addEventListener("click", () => renderListEditor(card, list, true));
  edit.addEventListener("click", () => renderListEditor(card, list));
  remove.addEventListener("click", () => confirmIconRemove(remove, async () => {
    lists = lists.filter((candidate) => candidate.id !== list.id);
    await saveLists(lists);
    renderLists();
  }));

  actions.append(addItem, edit, remove);
  header.append(title, actions);
  card.append(header, items);
  return card;
}

function normalizeListItems(items) {
  return (items || [])
    .map((item) => (typeof item === "string" ? item : item?.text))
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function renderListItem(item) {
  const bullet = document.createElement("li");
  bullet.textContent = item;
  return bullet;
}

function renderListEditor(card, list, startAddingItem = false) {
  const title = document.createElement("input");
  const items = document.createElement("textarea");
  const actions = document.createElement("div");
  const save = document.createElement("button");
  const cancel = document.createElement("button");
  const itemText = normalizeListItems(list.items).join("\n");

  title.type = "text";
  title.value = list.title || "";
  title.placeholder = "List name";
  title.setAttribute("aria-label", "List name");
  items.value = startAddingItem && itemText ? `${itemText}\n` : itemText;
  items.placeholder = "One bullet per line";
  items.setAttribute("aria-label", "List items");
  actions.className = "list-actions";
  save.type = "button";
  save.textContent = "Save";
  cancel.type = "button";
  cancel.className = "secondary-button";
  cancel.textContent = "Cancel";

  save.addEventListener("click", async () => {
    const nextTitle = title.value.trim();
    const nextItems = items.value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((text) => ({ id: createRuleId(), text }));

    if (!nextTitle && !nextItems.length) return;

    list.title = nextTitle || "Untitled list";
    list.items = nextItems;
    list.updatedAt = Date.now();
    await saveLists(lists);
    renderLists();
  });
  cancel.addEventListener("click", renderLists);

  actions.append(save, cancel);
  card.className = "list-card editing";
  card.replaceChildren(title, items, actions);

  if (startAddingItem) {
    items.focus();
    items.selectionStart = items.selectionEnd = items.value.length;
    return;
  }

  title.focus();
  title.select();
}

function renderTodoEditor(row, todo) {
  const input = document.createElement("textarea");
  const actions = document.createElement("div");
  const save = document.createElement("button");
  const cancel = document.createElement("button");

  input.value = todo.text;
  input.className = "todo-edit-input";
  input.rows = 4;
  input.setAttribute("aria-label", "Edit task");
  actions.className = "todo-actions";
  save.type = "button";
  save.textContent = "Save";
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.className = "secondary-button";

  save.addEventListener("click", async () => {
    const nextText = input.value.trim();
    if (!nextText) return;
    todo.text = nextText;
    syncTodoCompletionAfterTextChange(todo);
    await saveTodos(todos);
    renderTodos();
  });

  cancel.addEventListener("click", renderTodos);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save.click();
    }

    if (event.key === "Escape") renderTodos();
  });

  actions.append(save, cancel);
  row.className = "todo-row editing";
  row.replaceChildren(input, actions);
  input.focus();
  input.select();
}
