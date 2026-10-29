The goal is to reduce stimulation and increase focus.

Finalized tasks to work on

Strictly avoid working on below tasks, these are not finalized yet

- [ ] Test if time limit working on url with paths
- [ ] Check the error that occur when you open news.google.com than x.com
- [ ] Check extension errors in the browser
- [ ] Ask AI for feature and ui/ux improvements before launch
- [ ] Add tests for robust logic implementation
- [ ] Since the UI will get more complex over time, use react components
- [ ] Change todo section to tasks section
- [ ] Add journeys to the tasks section which would connect different tasks by arrows
- [ ] Make this extension available across all chrome and firefox based browser,s
- [ ] A way to sync rules across multiple browsers instances with this extension without logging in
- [ ] In tasks support links like in markdown
- [ ] Solve "Extension context invalidated Error" manually
- [ ] Add notes section in the extension
- [ ] The timer is not incrementing at the correct rate (1s at a time) and maybe showing less time than spent on a website. And the website is not closing right when the time limit is reached, it takes some more seconds like 10-60s to close the site after time limit reached.

## Design

- Color: maroon-first palette with `#7f1d1d` as the primary action color, `#5f1212` for hover states, and warm off-white backgrounds.
- Shape: low-radius controls and cards, usually `6px` to `10px`, to avoid the previous highly rounded/pill-like appearance.
- Data visualization: the usage chart is intentionally large and centered. Website/time details appear on hover/focus for each pie slice instead of a persistent right-side list.
- Usage ranges: the chart supports daily, weekly, monthly, and a custom start/end date range.
- Usage grouping: usage stats are grouped by website host, so different paths on the same site appear together.
- Interaction: tab-limit rules support `For whole group` and `For each website` counting modes.
- Time limits: each rule can apply to the whole website group or separately for each matching website.
- Time-limit timer: matching pages show a small fixed timer with remaining, used, and limit time.
- Pattern matching: site patterns are exact by default. Use `*.example.com` when a rule should include subdomains.
- Theme: appearance can be `Light`, `Dark`, or `System`; system resolves from `prefers-color-scheme`.
- Backup: rules can be exported/imported as JSON without including usage data.
- Todo list: options page includes a simple task list; popup shows only the number of unfinished tasks.
- Focus mode: options page includes a focus-mode toggle and website list for temporarily blocking selected sites.
- Focus badge: the extension action icon shows an `F` badge while Focus Mode is on.
- Focus tracking: Focus Mode time is saved daily, resumes from today's previous total, and shows a 7-day line graph.
- Todo editing: tasks can be edited inline and removed with a compact cross icon button.
- Todo completion: clicking task text toggles completion; no checkbox or row divider is shown.
- Typography: regular controls/text use `14px`, section headers use `18px`, and buttons use `12px`; `h1` and `p` sizing is left unchanged.
- Todo tags: one-word hashtags in task text are highlighted with separate foreground/background colors.
- Todo tag colors: task hashtags show a floating color control on hover/focus, and chosen colors persist per tag.
- Notes and lists: options page includes body-only pinned/editable notes and normal bullet lists stacked one after another.
- Break reminders: options page includes a Reminders section to configure minutes per site, automatically pause playing media, and show an overlay popup reminding the user to take a break.
- Rule deletion: tab-limit, time-limit, schedule, and reminder remove buttons require a second `Confirm?` click before deleting.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder.

## Usage

- Click the extension icon for today's current-site and top-site usage.
- Open `Settings` to add tab-limit rules, time-limit rules, allowed schedules, and break reminders.
- In `Usage`, choose `Custom range` to chart any selected start/end date period.
- Use `Debug data` on the settings page to inspect the raw extension storage JSON.
- Use `Rules backup` to export/import tab-limit, time-limit, schedule, and reminder rules.
- Set `Reminders` for sites (like YouTube or Twitch); once the configured time is reached, all playing video/audio pauses and an overlay popup prompts you to take a break.
- Use `Todo list` in settings for simple tasks; the popup shows the tasks-left count.
- Use `Notes` for quick pinned thoughts and `Lists` for reusable bullet lists.
- Site patterns can be comma-separated or line-separated, for example `www.youtube.com, reddit.com, *.twitter.com`.
- Patterns are exact unless they start with `*.`. For example, `www.youtube.com` does not match `music.youtube.com`, but `*.youtube.com` matches both.
- Paths are respected when included. For example, `www.google.com/search` matches `/search` and `/search/...`, but not `/maps`.
- Usage charts group paths by host, so `www.youtube.com/hello` and `www.youtube.com/hii` appear as one `www.youtube.com` total.
- Time limits redirect matching tabs to a local blocked page once the configured daily, weekly, or monthly budget is reached.
- Sites covered by a time-limit rule show a small on-page timer while browsing.
- Use `Focus mode` in settings to temporarily block selected websites until the toggle is turned off.
