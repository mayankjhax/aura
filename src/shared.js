const STORAGE_KEYS = {
  SETTINGS: "focusGuardSettings",
  USAGE: "focusGuardUsage",
  PATH_USAGE: "focusGuardPathUsage",
  ACTIVE: "focusGuardActiveSession",
  TODOS: "focusGuardTodos",
  TAG_COLORS: "focusGuardTagColors",
  NOTES: "focusGuardNotes",
  LISTS: "focusGuardLists",
  FOCUS_USAGE: "focusGuardFocusUsage",
  FOCUS_SESSION: "focusGuardFocusSession",
  REMINDER_STATE: "focusGuardReminderState"
};

const DEFAULT_SETTINGS = {
  tabLimits: [],
  timeLimits: [],
  allowedSchedules: [],
  reminders: [],
  focusMode: {
    enabled: false,
    patterns: ""
  },
  theme: "system",
  maxTabsPerWindow: null,
  maxTabsTotal: null
};

const PERIODS = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly"
};

function todayKey(date = new Date()) {
  return toDateKey(date);
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPeriodStart(period, date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (period === PERIODS.WEEKLY) {
    const day = start.getDay();
    const daysSinceMonday = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - daysSinceMonday);
  }

  if (period === PERIODS.MONTHLY) {
    start.setDate(1);
  }

  return toDateKey(start);
}

function getHost(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith("http")) return "";
    return parsed.hostname.toLowerCase();
  } catch (_error) {
    return "";
  }
}

function getUsageKey(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith("http")) return "";
    const path = normalizePath(parsed.pathname);
    return `${parsed.hostname.toLowerCase()}${path}`;
  } catch (_error) {
    return "";
  }
}

function normalizePath(path) {
  if (!path || path === "/") return "";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized.replace(/\/+$/, "").toLowerCase();
}

function splitUsageKey(key) {
  const slashIndex = String(key || "").indexOf("/");
  if (slashIndex < 0) return { host: String(key || "").toLowerCase(), path: "" };
  return {
    host: key.slice(0, slashIndex).toLowerCase(),
    path: normalizePath(key.slice(slashIndex))
  };
}

function normalizePatterns(patterns) {
  return parsePatterns(patterns).map((pattern) => `${pattern.host}${pattern.path}`);
}

function parsePatterns(patterns) {
  return String(patterns || "")
    .split(/[\n,]+/)
    .map(parsePattern)
    .filter(Boolean);
}

function parsePattern(pattern) {
  const cleaned = String(pattern || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/[?#].*$/, "");
  if (!cleaned) return null;

  const slashIndex = cleaned.indexOf("/");
  const host = (slashIndex < 0 ? cleaned : cleaned.slice(0, slashIndex)).toLowerCase();
  const path = slashIndex < 0 ? "" : normalizePath(cleaned.slice(slashIndex));
  if (!host) return null;

  return { host, path };
}

function hostMatchesPattern(host, patternHost) {
  if (patternHost === "*") return true;
  if (patternHost.startsWith("*.")) {
    const suffix = patternHost.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }
  return host === patternHost;
}

function pathMatchesPattern(path, patternPath) {
  if (!patternPath) return true;
  return path === patternPath || path.startsWith(`${patternPath}/`);
}

function hostMatchesPatterns(host, patterns) {
  if (!host) return false;
  const normalizedHost = host.toLowerCase();

  return parsePatterns(patterns).some((pattern) => !pattern.path && hostMatchesPattern(normalizedHost, pattern.host));
}

function urlMatchesPatterns(url, patterns) {
  const key = getUsageKey(url);
  return usageKeyMatchesPatterns(key, patterns);
}

function usageKeyMatchesPatterns(key, patterns) {
  const target = splitUsageKey(key);
  if (!target.host) return false;

  return parsePatterns(patterns).some((pattern) => {
    return hostMatchesPattern(target.host, pattern.host) && pathMatchesPattern(target.path, pattern.path);
  });
}

function getMatchingRuleForUrl(url, rules) {
  return (rules || []).find((rule) => rule.enabled !== false && urlMatchesPatterns(url, rule.patterns));
}

function isWithinAllowedSchedule(rule, date = new Date()) {
  const days = Array.isArray(rule?.days) ? rule.days.map(Number) : [];
  const startMinutes = timeToMinutes(rule?.startTime);
  const endMinutes = timeToMinutes(rule?.endTime);
  if (!days.length || startMinutes === null || endMinutes === null || startMinutes === endMinutes) return false;

  const currentDay = date.getDay();
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const previousDay = (currentDay + 6) % 7;

  if (startMinutes < endMinutes) {
    return days.includes(currentDay) && currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return (days.includes(currentDay) && currentMinutes >= startMinutes) ||
    (days.includes(previousDay) && currentMinutes < endMinutes);
}

function timeToMinutes(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

function parseTabLimitInput(value) {
  const parsed = parseInt(String(value ?? "").trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function createRuleId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function periodUsageForHost(usage, host, period, date = new Date()) {
  const startKey = getPeriodStart(period, date);
  const endKey = toDateKey(date);
  let total = 0;

  Object.entries(usage || {}).forEach(([dateKey, hosts]) => {
    if (dateKey >= startKey && dateKey <= endKey) {
      Object.entries(hosts || {}).forEach(([key, ms]) => {
        if (splitUsageKey(key).host === host) total += ms;
      });
    }
  });

  return total;
}

function periodUsageForPatterns(usage, patterns, period, date = new Date()) {
  const startKey = getPeriodStart(period, date);
  const endKey = toDateKey(date);
  let total = 0;

  Object.entries(usage || {}).forEach(([dateKey, hosts]) => {
    if (dateKey < startKey || dateKey > endKey) return;
    Object.entries(hosts || {}).forEach(([host, ms]) => {
      if (usageKeyMatchesPatterns(host, patterns)) total += ms;
    });
  });

  return total;
}

function periodUsageForTimeRule(hostUsage, pathUsage, patterns, period, date = new Date(), targetHost = "") {
  const parsedPatterns = parsePatterns(patterns);
  const hostOnlyPatterns = parsedPatterns.filter((pattern) => !pattern.path);
  const pathPatterns = parsedPatterns.filter((pattern) => pattern.path);
  let total = 0;

  if (hostOnlyPatterns.length) {
    total += periodUsageForParsedPatterns(
      hostUsage,
      hostOnlyPatterns,
      period,
      date,
      targetHost
    );
  }

  const uncoveredPathPatterns = pathPatterns.filter((pathPattern) => {
    return !hostOnlyPatterns.some((hostPattern) => hostMatchesPattern(pathPattern.host, hostPattern.host));
  });

  if (uncoveredPathPatterns.length) {
    total += periodUsageForParsedPatterns(
      pathUsage,
      uncoveredPathPatterns,
      period,
      date,
      targetHost
    );
  }

  return total;
}

function periodUsageForParsedPatterns(usage, parsedPatterns, period, date = new Date(), targetHost = "") {
  const startKey = getPeriodStart(period, date);
  const endKey = toDateKey(date);
  let total = 0;

  Object.entries(usage || {}).forEach(([dateKey, hosts]) => {
    if (dateKey < startKey || dateKey > endKey) return;
    Object.entries(hosts || {}).forEach(([key, ms]) => {
      const usageTarget = splitUsageKey(key);
      if (targetHost && usageTarget.host !== targetHost) return;
      if (usageKeyMatchesParsedPatterns(key, parsedPatterns)) total += ms;
    });
  });

  return total;
}

function usageKeyMatchesParsedPatterns(key, parsedPatterns) {
  const target = splitUsageKey(key);
  if (!target.host) return false;

  return parsedPatterns.some((pattern) => {
    return hostMatchesPattern(target.host, pattern.host) && pathMatchesPattern(target.path, pattern.path);
  });
}

async function getSettings() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(stored[STORAGE_KEYS.SETTINGS] || {}) };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
}

async function getUsage() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.USAGE);
  return stored[STORAGE_KEYS.USAGE] || {};
}

async function saveUsage(usage) {
  await chrome.storage.local.set({ [STORAGE_KEYS.USAGE]: usage });
}

async function getPathUsage() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.PATH_USAGE);
  return stored[STORAGE_KEYS.PATH_USAGE] || {};
}

async function savePathUsage(usage) {
  await chrome.storage.local.set({ [STORAGE_KEYS.PATH_USAGE]: usage });
}

async function getTodos() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.TODOS);
  return stored[STORAGE_KEYS.TODOS] || [];
}

async function saveTodos(todos) {
  await chrome.storage.local.set({ [STORAGE_KEYS.TODOS]: todos });
}

async function getTagColors() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.TAG_COLORS);
  return stored[STORAGE_KEYS.TAG_COLORS] || {};
}

async function saveTagColors(tagColors) {
  await chrome.storage.local.set({ [STORAGE_KEYS.TAG_COLORS]: tagColors });
}

async function getNotes() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.NOTES);
  return stored[STORAGE_KEYS.NOTES] || [];
}

async function saveNotes(notes) {
  await chrome.storage.local.set({ [STORAGE_KEYS.NOTES]: notes });
}

async function getLists() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.LISTS);
  return stored[STORAGE_KEYS.LISTS] || [];
}

async function saveLists(lists) {
  await chrome.storage.local.set({ [STORAGE_KEYS.LISTS]: lists });
}

async function getFocusUsage() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.FOCUS_USAGE);
  return stored[STORAGE_KEYS.FOCUS_USAGE] || {};
}

async function saveFocusUsage(usage) {
  await chrome.storage.local.set({ [STORAGE_KEYS.FOCUS_USAGE]: usage });
}

async function getFocusSession() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.FOCUS_SESSION);
  return stored[STORAGE_KEYS.FOCUS_SESSION] || null;
}

async function saveFocusSession(session) {
  await chrome.storage.local.set({ [STORAGE_KEYS.FOCUS_SESSION]: session });
}

async function getReminderState() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.REMINDER_STATE);
  return stored[STORAGE_KEYS.REMINDER_STATE] || {};
}

async function saveReminderState(state) {
  await chrome.storage.local.set({ [STORAGE_KEYS.REMINDER_STATE]: state });
}

function addElapsedByDay(usage, startedAt, endedAt) {
  let cursor = Number(startedAt);
  const end = Number(endedAt);

  while (cursor < end) {
    const cursorDate = new Date(cursor);
    const nextDay = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), cursorDate.getDate() + 1).getTime();
    const segmentEnd = Math.min(end, nextDay);
    const day = todayKey(cursorDate);

    usage[day] = (usage[day] || 0) + Math.max(0, segmentEnd - cursor);
    cursor = segmentEnd;
  }

  return usage;
}

function applyThemeMode(theme) {
  if (typeof document === "undefined") return;

  const preference = theme || "system";
  const systemDark = typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = preference === "system" ? (systemDark ? "dark" : "light") : preference;

  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = resolved;
}

async function applyStoredTheme() {
  const settings = await getSettings();
  applyThemeMode(settings.theme || "system");
}
