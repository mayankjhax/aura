const COLORS = ["#7f1d1d", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#be123c", "#4d7c0f"];
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

document.addEventListener("DOMContentLoaded", initOptions);

const DEFAULT_SCHEDULE_DAYS = [1, 2, 3, 4, 5];

async function initOptions() {
  await applyStoredTheme();
  await sendRuntimeMessage({ type: "FOCUS_GUARD_FLUSH" });
  settings = await getSettings();
  document.getElementById("themeMode").value = settings.theme || "system";
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
  });
  document.getElementById("focusModeEnabled").addEventListener("change", persistFocusMode);
  document.getElementById("focusModePatterns").addEventListener("input", persistFocusMode);
  document.getElementById("showRawData").addEventListener("click", toggleRawData);
  document.getElementById("exportRules").addEventListener("click", exportRules);
  document.getElementById("importRules").addEventListener("click", () => document.getElementById("importRulesFile").click());
  document.getElementById("importRulesFile").addEventListener("change", importRules);
  document.getElementById("addTodo").addEventListener("click", startTodoDraft);
  document.getElementById("addNote").addEventListener("click", addNote);
  document.getElementById("addList").addEventListener("click", addList);

  todos = await getTodos();
  tagColors = await getTagColors();
  notes = await getNotes();
  lists = await getLists();
  syncCustomRangeVisibility();
  renderRules();
  renderTodos();
  renderNotes();
  renderLists();
  await renderFocusStats();
  focusStatsTimer = setInterval(renderFocusStats, 1000);
  await renderUsage();
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
  await saveSettings(settings);
  if (enforce) await sendRuntimeMessage({ type: "FOCUS_GUARD_ENFORCE" });
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
  await sendRuntimeMessage({ type: "FOCUS_GUARD_FOCUS_FLUSH" });
  const usage = await getFocusUsage();
  const today = todayKey();
  const todayMs = usage[today] || 0;

  document.getElementById("focusToday").textContent = formatDuration(todayMs);
  renderFocusGraph(usage);
}

function renderFocusGraph(usage) {
  const graph = document.getElementById("focusGraph");
  const days = getLastSevenDateKeys();
  const values = days.map((day) => usage[day] || 0);
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = 8 + index * 14;
    const y = 82 - (value / max) * 66;
    return `${x},${y}`;
  });

  graph.replaceChildren();
  const svg = createSvgElement("svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("aria-hidden", "true");

  const polyline = createSvgElement("polyline");
  polyline.setAttribute("points", points.join(" "));
  polyline.setAttribute("class", "focus-line");
  svg.append(polyline);

  points.forEach((point, index) => {
    const [x, y] = point.split(",");
    const circle = createSvgElement("circle");
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", "2.4");
    circle.setAttribute("class", "focus-dot");
    svg.append(circle);

    const label = document.createElement("span");
    label.textContent = `${days[index].slice(5)} ${formatDuration(values[index])}`;
    label.className = "focus-graph-label";
    graph.append(label);
  });

  graph.prepend(svg);
}

function getLastSevenDateKeys() {
  return Array.from({ length: 7 }, (_value, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return todayKey(date);
  });
}

async function sendRuntimeMessage(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch {
    return null;
  }
}

async function renderUsage() {
  const usage = await getUsage();
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
  const chart = document.getElementById("pieChart");
  const tooltip = document.getElementById("pieTooltip");
  const hint = document.getElementById("usageHint");
  const total = entries.reduce((sum, [, ms]) => sum + ms, 0);
  chart.replaceChildren();
  tooltip.hidden = true;
  chart.style.background = "";

  if (!total) {
    chart.setAttribute("aria-label", "No usage tracked for this period");
    hint.textContent = "No usage tracked for this period.";
    return;
  }

  chart.setAttribute("aria-label", `Usage pie chart with ${entries.length} sites`);
  hint.textContent = `Total time: ${formatDuration(total)}`;

  const svg = createSvgElement("svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("aria-hidden", "true");

  let cursor = -90;
  entries.forEach(([host, ms], index) => {
    const sweep = (ms / total) * 360;
    const path = createSvgElement("path");
    path.setAttribute("d", describeSlice(50, 50, 50, cursor, cursor + sweep));
    path.setAttribute("fill", COLORS[index]);
    path.tabIndex = 0;

    const showTooltip = () => {
      tooltip.textContent = `${host}: ${formatDuration(ms)}`;
      tooltip.hidden = false;
    };
    const hideTooltip = () => {
      tooltip.hidden = true;
    };

    path.addEventListener("mouseenter", showTooltip);
    path.addEventListener("focus", showTooltip);
    path.addEventListener("mouseleave", hideTooltip);
    path.addEventListener("blur", hideTooltip);

    svg.append(path);
    cursor += sweep;
  });

  chart.append(svg);
}

function createSvgElement(tagName) {
  return document.createElementNS("http://www.w3.org/2000/svg", tagName);
}

function describeSlice(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [`M ${cx} ${cy}`, `L ${start.x} ${start.y}`, `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`, "Z"].join(" ");
}

function polarToCartesian(cx, cy, radius, angleInDegrees) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians)
  };
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
  anchor.download = `focus-guard-rules-${todayKey()}.json`;
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
    .split("→")
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
