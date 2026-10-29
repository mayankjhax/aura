const params = new URLSearchParams(location.search);
const rule = params.get("rule") || "this site";
const period = params.get("period") || "period";
const reason = params.get("reason") || "time-limit";

document.addEventListener("DOMContentLoaded", async () => {
  await applyStoredTheme();
  const messages = {
    focus: "This site is blocked while focus mode is on.",
    schedule: `${rule} is only allowed during its assigned schedule.`,
    "time-limit": `${rule} has reached its ${period} time limit.`
  };

  document.getElementById("message").textContent = messages[reason] || messages["time-limit"];
  document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
});
