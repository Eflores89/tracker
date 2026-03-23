/*
 * Tracker — Supabase-backed daily tracker.
 *
 * Set SUPABASE_URL and SUPABASE_ANON_KEY to your Supabase project values.
 */
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
const TABLE = "daily_logs";

// ---- Supabase REST helpers ----

function supabaseHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

async function supaGet(date) {
  const url = `${SUPABASE_URL}/rest/v1/${TABLE}?date=eq.${date}&select=*`;
  const res = await fetch(url, { headers: supabaseHeaders() });
  if (!res.ok) throw new Error("Failed to fetch");
  const rows = await res.json();
  return rows[0] || null;
}

async function supaUpsert(row) {
  const url = `${SUPABASE_URL}/rest/v1/${TABLE}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...supabaseHeaders(), Prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error("Failed to save");
  const rows = await res.json();
  return rows[0];
}

async function supaGetRange(from, to) {
  const url = `${SUPABASE_URL}/rest/v1/${TABLE}?date=gte.${from}&date=lte.${to}&select=date,water,coffee,exercise,sleep,mood,food_breakfast,food_lunch,food_dinner,food_snacks&order=date.asc`;
  const res = await fetch(url, { headers: supabaseHeaders() });
  if (!res.ok) throw new Error("Failed to fetch range");
  return res.json();
}

// ---- Tracking config ----

const FIELDS = [
  { key: "water",          label: "Water",     icon: "\u{1F4A7}", type: "counter", max: 3, unit: "glasses", color: "blue" },
  { key: "coffee",         label: "Coffee",    icon: "\u2615",    type: "counter", max: 3, unit: "cups",    color: "brown" },
  { key: "exercise",       label: "Exercise",  icon: "\u{1F4AA}", type: "select",  options: ["hard", "soft"],                 color: "green" },
  { key: "sleep",          label: "Sleep",     icon: "\u{1F634}", type: "select",  options: ["bad", "good", "perfect"],       color: "purple" },
  { key: "mood",           label: "Mood",      icon: "\u{1F60A}", type: "multi",   max: 4, options: ["happy","excited","sad","anxious","depressed","bored","productive","cheerful","energized","tired","angry","nervous"], color: "pink" },
  { key: "food_breakfast", label: "Breakfast",  icon: "\u{1F950}", type: "rating",  max: 5, color: "amber" },
  { key: "food_lunch",     label: "Lunch",      icon: "\u{1F957}", type: "rating",  max: 5, color: "green" },
  { key: "food_dinner",    label: "Dinner",     icon: "\u{1F37D}\uFE0F", type: "rating", max: 5, color: "red" },
  { key: "food_snacks",    label: "Snacks",     icon: "\u{1F36A}", type: "rating",  max: 5, color: "amber" },
];

function defaultState(date) {
  return { date, water: 0, coffee: 0, exercise: null, sleep: null, mood: [], food_breakfast: 0, food_lunch: 0, food_dinner: 0, food_snacks: 0 };
}

// ---- State ----

let state = null;
let saving = false;
let dirty = false;

// ---- Date helper ----

function localTodayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(iso) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// ---- DOM helpers ----

const $ = (sel) => document.querySelector(sel);
const show = (el) => el.classList.remove("hidden");
const hide = (el) => el.classList.add("hidden");

// ---- Completion check ----

function isFieldDone(field, st) {
  const val = st[field.key];
  switch (field.type) {
    case "counter": return val >= field.max;
    case "select":  return !!val;
    case "multi":   return (val?.length ?? 0) >= field.max;
    case "rating":  return val > 0;
  }
}

function isAllDone(st) {
  return FIELDS.every((f) => isFieldDone(f, st));
}

// ---- Render cards ----

function renderCards() {
  const container = $("#cards");
  container.innerHTML = "";

  for (const field of FIELDS) {
    if (isFieldDone(field, state)) continue;

    const card = document.createElement("section");
    card.className = `card card-${field.color}` + (field.type === "multi" ? " card-wide" : "");

    let headerHTML = `<div class="card-header"><span class="icon icon-${field.color}">${field.icon}</span><div><h2>${field.label}</h2>`;

    if (field.type === "counter") {
      headerHTML += `<p class="hint">${state[field.key]} / ${field.max} ${field.unit}</p>`;
    } else if (field.type === "multi") {
      headerHTML += `<p class="hint">${state[field.key]?.length ?? 0} / ${field.max} selected</p>`;
    }

    headerHTML += `</div></div>`;

    let buttonsHTML = `<div class="btn-group${field.type === "multi" ? " btn-group-wide" : ""}">`;

    if (field.type === "counter") {
      buttonsHTML += `<button data-field="${field.key}" class="btn btn-${field.key}">+1 ${field.unit.replace(/s$/, "")}</button>`;
    } else if (field.type === "select") {
      for (const opt of field.options) {
        buttonsHTML += `<button data-field="${field.key}" data-value="${opt}" class="btn">${opt.charAt(0).toUpperCase() + opt.slice(1)}</button>`;
      }
    } else if (field.type === "multi") {
      const selected = state[field.key] || [];
      const full = selected.length >= field.max;
      for (const opt of field.options) {
        const isActive = selected.includes(opt);
        const disabled = isActive || full ? "disabled" : "";
        const cls = isActive ? "btn btn-mood btn-mood-active" : "btn btn-mood";
        buttonsHTML += `<button data-field="${field.key}" data-value="${opt}" class="${cls}" ${disabled}>${opt.charAt(0).toUpperCase() + opt.slice(1)}</button>`;
      }
    } else if (field.type === "rating") {
      for (let i = 1; i <= field.max; i++) {
        buttonsHTML += `<button data-field="${field.key}" data-value="${i}" class="btn">${i}</button>`;
      }
    }

    buttonsHTML += `</div>`;
    card.innerHTML = headerHTML + buttonsHTML;
    container.appendChild(card);
  }

  if (isAllDone(state)) {
    show($("#all-done"));
  } else {
    hide($("#all-done"));
  }
}

function render() {
  hide($("#loading"));
  $("#date").textContent = formatDate(state.date);
  renderCards();
}

// ---- Optimistic state update ----

function applyUpdate(field, value) {
  const f = FIELDS.find((f) => f.key === field);
  if (!f) return;

  switch (f.type) {
    case "counter":
      state[field] = Math.min((state[field] ?? 0) + 1, f.max);
      break;
    case "select":
      state[field] = value;
      break;
    case "multi":
      if (!state[field]) state[field] = [];
      if (!state[field].includes(value) && state[field].length < f.max) {
        state[field] = [...state[field], value];
      }
      break;
    case "rating":
      state[field] = Number(value);
      break;
  }
}

// ---- Save (debounced upsert) ----

let saveTimer = null;

function scheduleSave() {
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistState, 1500);
}

async function persistState() {
  if (saving || !dirty) return;
  saving = true;
  dirty = false;
  try {
    const row = { ...state };
    // Convert mood array to JSON string for Supabase text column
    if (Array.isArray(row.mood)) row.mood = JSON.stringify(row.mood);
    await supaUpsert(row);
  } catch (err) {
    console.error("Save failed:", err);
    dirty = true; // retry on next interaction
  } finally {
    saving = false;
  }
}

// ---- Fetch today ----

async function fetchToday() {
  const date = localTodayISO();
  const row = await supaGet(date);
  if (row) {
    if (typeof row.mood === "string") {
      try { row.mood = JSON.parse(row.mood); } catch { row.mood = []; }
    }
    state = row;
  } else {
    state = defaultState(date);
  }
  render();
}

// ---- Event listeners ----

document.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-field]");
  if (!btn || btn.disabled) return;

  const field = btn.dataset.field;
  const value = btn.dataset.value ?? null;

  applyUpdate(field, value);
  render();
  scheduleSave();
});

// Tab switching
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.add("hidden"));
    $(`#tab-${tab.dataset.tab}`).classList.remove("hidden");

    if (tab.dataset.tab === "dashboard") renderDashboard();
  });
});

// ---- Dashboard: Streak + Heatmap ----

async function renderDashboard() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 364); // ~52 weeks
  const fromISO = from.toISOString().slice(0, 10);
  const toISO = localTodayISO();

  let rows;
  try {
    rows = await supaGetRange(fromISO, toISO);
  } catch {
    $("#streak-info").innerHTML = `<p class="loading">Could not load dashboard data.</p>`;
    return;
  }

  // Build lookup
  const byDate = {};
  for (const r of rows) {
    if (typeof r.mood === "string") {
      try { r.mood = JSON.parse(r.mood); } catch { r.mood = []; }
    }
    byDate[r.date] = r;
  }

  // Calculate streak
  let currentStreak = 0;
  let longestStreak = 0;
  let totalDays = rows.filter((r) => isAllDone(r)).length;
  let streak = 0;
  const d = new Date(today);
  while (true) {
    const iso = d.toISOString().slice(0, 10);
    const row = byDate[iso];
    if (row && isAllDone(row)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  currentStreak = streak;

  // Longest streak from all data
  streak = 0;
  const sortedDates = Object.keys(byDate).sort();
  for (const dt of sortedDates) {
    if (isAllDone(byDate[dt])) {
      streak++;
      longestStreak = Math.max(longestStreak, streak);
    } else {
      streak = 0;
    }
  }

  // Render stats
  $("#streak-info").innerHTML = `
    <div class="streak-stat"><div class="num">${currentStreak}</div><div class="label">Current streak</div></div>
    <div class="streak-stat"><div class="num">${longestStreak}</div><div class="label">Longest streak</div></div>
    <div class="streak-stat"><div class="num">${totalDays}</div><div class="label">Total days</div></div>
  `;

  // Render heatmap (GitHub-style: 52 weeks, Sun-Sat columns)
  const container = $("#heatmap");
  const startDay = new Date(from);
  // Align to previous Sunday
  startDay.setDate(startDay.getDate() - startDay.getDay());

  let html = `<h3>Completion heatmap</h3>`;

  // Month labels
  html += `<div class="heatmap-months">`;
  let prevMonth = -1;
  const cursor = new Date(startDay);
  let weekIndex = 0;
  while (cursor <= today) {
    const m = cursor.getMonth();
    if (m !== prevMonth && cursor.getDay() === 0) {
      const monthName = cursor.toLocaleDateString("en-US", { month: "short" });
      html += `<span style="width: ${weekIndex === 0 ? 0 : 17}px"></span>`;
      if (weekIndex > 0) html += `<span>${monthName}</span>`;
      prevMonth = m;
    }
    cursor.setDate(cursor.getDate() + 7);
    weekIndex++;
  }
  html += `</div>`;

  html += `<div class="heatmap-grid">`;
  const iter = new Date(startDay);
  while (iter <= today) {
    const iso = iter.toISOString().slice(0, 10);
    const row = byDate[iso];
    let level = 0;
    if (row) {
      const completed = FIELDS.filter((f) => isFieldDone(f, row)).length;
      const pct = completed / FIELDS.length;
      if (pct > 0 && pct < 0.33) level = 1;
      else if (pct >= 0.33 && pct < 0.66) level = 2;
      else if (pct >= 0.66 && pct < 1) level = 3;
      else if (pct >= 1) level = 4;
    }
    const dateLabel = iter.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    html += `<div class="heatmap-cell" data-level="${level}" title="${dateLabel}: ${level === 0 ? 'No data' : `Level ${level}/4`}"></div>`;
    iter.setDate(iter.getDate() + 1);
  }
  html += `</div>`;

  html += `<div class="heatmap-legend">Less <div class="heatmap-cell" data-level="0"></div><div class="heatmap-cell" data-level="1"></div><div class="heatmap-cell" data-level="2"></div><div class="heatmap-cell" data-level="3"></div><div class="heatmap-cell" data-level="4"></div> More</div>`;

  container.innerHTML = html;
}

// ---- Init ----

fetchToday().catch((err) => {
  console.error(err);
  $("#loading").textContent = "Could not load data. Check your connection.";
});

// Refetch when tab becomes visible
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    fetchToday().catch(console.error);
  }
});

// Save before closing
window.addEventListener("beforeunload", () => {
  if (dirty && state) {
    const row = { ...state };
    if (Array.isArray(row.mood)) row.mood = JSON.stringify(row.mood);
    const blob = new Blob([JSON.stringify(row)], { type: "application/json" });
    navigator.sendBeacon(
      `${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=date`,
      blob
    );
  }
});
