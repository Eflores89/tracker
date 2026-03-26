/*
 * Tracker — Supabase-backed daily tracker with dynamic fields.
 *
 * Set SUPABASE_URL and SUPABASE_ANON_KEY to your Supabase project values.
 */
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

// ---- Supabase REST helpers ----

function headers(prefer) {
  const h = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
  if (prefer) h.Prefer = prefer;
  return h;
}

async function supa(method, table, query, body, prefer) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? "?" + query : ""}`;
  const opts = { method, headers: headers(prefer || (method !== "GET" ? "return=representation" : undefined)) };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`Supabase ${method} ${table} failed: ${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

// Shorthand
const supaGet = (table, q) => supa("GET", table, q);
const supaPost = (table, body, prefer) => supa("POST", table, null, body, prefer);
const supaPatch = (table, q, body) => supa("PATCH", table, q, body);
const supaDelete = (table, q) => supa("DELETE", table, q);

// ---- Date helpers ----

function todayISO() {
  const d = new Date();
  return isoDate(d);
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(iso) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function daysBetween(a, b) {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db - da) / 86400000);
}

// ---- DOM helpers ----

const $ = (sel) => document.querySelector(sel);
const show = (el) => el.classList.remove("hidden");
const hide = (el) => el.classList.add("hidden");

// ---- App state ----

let fields = [];        // tracker_fields rows
let entries = {};       // { [field_id]: { value, ... } } for today
let allEntries = [];    // for dashboard
let today = todayISO();

// ---- Field visibility (recurrence logic) ----

function isFieldDueToday(field) {
  // Expired?
  if (field.expires_at && field.expires_at < today) return false;
  // Not yet active? (created in the future — unlikely but safe)
  if (field.created_at && field.created_at.slice(0, 10) > today) return false;

  if (field.recurrence === "daily") return true;

  if (field.recurrence === "every_n_days") {
    const interval = field.recurrence_days || 7;
    const showBefore = field.show_days_before || 0;
    // Find last completion for this field
    const entry = entries[field.id];
    if (!entry) {
      // Never done — check from created_at
      const created = (field.created_at || today).slice(0, 10);
      const daysSinceCreated = daysBetween(created, today);
      // Due on creation day, then every N days
      const daysSinceLastDue = daysSinceCreated % interval;
      const daysUntilNextDue = daysSinceLastDue === 0 ? 0 : interval - daysSinceLastDue;
      return daysUntilNextDue <= showBefore || daysUntilNextDue === 0 || daysSinceCreated === 0;
    }
    // Has been done before — find last completion from allEntries
    const lastDone = findLastCompletion(field.id);
    if (!lastDone) return true; // no history, show it
    const daysSinceDone = daysBetween(lastDone, today);
    const daysUntilDue = interval - daysSinceDone;
    return daysUntilDue <= showBefore;
  }

  return true;
}

function findLastCompletion(fieldId) {
  // Search allEntries for the most recent completed entry for this field (before today)
  let last = null;
  for (const e of allEntries) {
    if (e.field_id === fieldId && e.date < today && e.value) {
      if (!last || e.date > last) last = e.date;
    }
  }
  return last;
}

function isEntryDone(field, entry) {
  if (!entry || !entry.value) return false;
  const config = field.config || {};
  switch (field.type) {
    case "counter": return Number(entry.value) >= (config.max || 1);
    case "check":   return entry.value === "true";
    case "select":  return true;
    case "rating":  return Number(entry.value) > 0;
    case "multi":   {
      try { return JSON.parse(entry.value).length >= (config.max || 1); }
      catch { return false; }
    }
  }
  return false;
}

// ---- Fetch data ----

async function loadFields() {
  fields = await supaGet("tracker_fields", "order=sort_order.asc,created_at.asc&select=*") || [];
}

async function loadTodayEntries() {
  const rows = await supaGet("tracker_entries", `date=eq.${today}&select=*`) || [];
  entries = {};
  for (const r of rows) entries[r.field_id] = r;
}

async function loadRecentEntries() {
  const from = new Date();
  from.setDate(from.getDate() - 365);
  const fromISO = isoDate(from);
  allEntries = await supaGet("tracker_entries", `date=gte.${fromISO}&date=lte.${today}&select=field_id,date,value&order=date.asc`) || [];
}

async function init() {
  try {
    await Promise.all([loadFields(), loadTodayEntries(), loadRecentEntries()]);
    render();
  } catch (err) {
    console.error(err);
    $("#loading").textContent = "Could not load data. Check your Supabase config.";
  }
}

// ---- Render: Today tab ----

function render() {
  hide($("#loading"));
  $("#date").textContent = formatDate(today);
  renderCards();
}

function renderCards() {
  const container = $("#cards");
  container.innerHTML = "";

  const activeFields = fields.filter((f) => f.active !== false);
  const dueFields = activeFields.filter((f) => isFieldDueToday(f));
  let allDone = true;

  for (const field of dueFields) {
    const entry = entries[field.id];
    if (isEntryDone(field, entry)) continue;
    allDone = false;

    const config = field.config || {};
    const card = document.createElement("section");
    const isWide = field.type === "multi";
    card.className = `card card-${field.color || "blue"}${isWide ? " card-wide" : ""}`;

    let headerHTML = `<div class="card-header"><span class="icon icon-${field.color || "blue"}">${field.icon || ""}</span><div><h2>${esc(field.label)}</h2>`;

    if (field.type === "counter") {
      const cur = entry ? Number(entry.value) : 0;
      headerHTML += `<p class="hint">${cur} / ${config.max || 1} ${esc(config.unit || "")}</p>`;
    } else if (field.type === "multi") {
      let selected = [];
      try { selected = entry ? JSON.parse(entry.value) : []; } catch {}
      headerHTML += `<p class="hint">${selected.length} / ${config.max || 1} selected</p>`;
    }
    if (field.recurrence === "every_n_days") {
      headerHTML += `<p class="hint recurrence-hint">Every ${field.recurrence_days || 7} days</p>`;
    }

    headerHTML += `</div></div>`;

    let btnsHTML = `<div class="btn-group${isWide ? " btn-group-wide" : ""}">`;

    if (field.type === "counter") {
      const unit = (config.unit || "item").replace(/s$/, "");
      btnsHTML += `<button data-field-id="${field.id}" data-action="increment" class="btn btn-${field.color || "blue"}">+1 ${esc(unit)}</button>`;
    } else if (field.type === "check") {
      const done = entry?.value === "true";
      btnsHTML += `<button data-field-id="${field.id}" data-action="set" data-value="true" class="btn"${done ? " disabled" : ""}>Done</button>`;
    } else if (field.type === "select") {
      const opts = config.options || [];
      for (const opt of opts) {
        btnsHTML += `<button data-field-id="${field.id}" data-action="set" data-value="${esc(opt)}" class="btn">${esc(cap(opt))}</button>`;
      }
    } else if (field.type === "rating") {
      for (let i = 1; i <= (config.max || 5); i++) {
        btnsHTML += `<button data-field-id="${field.id}" data-action="set" data-value="${i}" class="btn">${i}</button>`;
      }
    } else if (field.type === "multi") {
      const opts = config.options || [];
      let selected = [];
      try { selected = entry ? JSON.parse(entry.value) : []; } catch {}
      const full = selected.length >= (config.max || 1);
      for (const opt of opts) {
        const isActive = selected.includes(opt);
        const dis = isActive || full ? "disabled" : "";
        const cls = isActive ? "btn btn-mood btn-mood-active" : "btn btn-mood";
        btnsHTML += `<button data-field-id="${field.id}" data-action="multi" data-value="${esc(opt)}" class="${cls}" ${dis}>${esc(cap(opt))}</button>`;
      }
    }

    btnsHTML += `</div>`;
    card.innerHTML = headerHTML + btnsHTML;
    container.appendChild(card);
  }

  if (dueFields.length === 0) {
    container.innerHTML = `<p class="loading">No items to track. Add some in Settings.</p>`;
    hide($("#all-done"));
  } else if (allDone) {
    show($("#all-done"));
  } else {
    hide($("#all-done"));
  }
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---- Track action ----

// Serialize saves per field to avoid race conditions (e.g. rapid mood clicks)
const saveQueues = {};

function enqueueSave(fieldId) {
  if (!saveQueues[fieldId]) saveQueues[fieldId] = Promise.resolve();
  saveQueues[fieldId] = saveQueues[fieldId].then(async () => {
    const current = entries[fieldId];
    if (!current) return;
    const valueToSave = current.value;
    try {
      const rows = await supa("POST", "tracker_entries", "on_conflict=field_id,date", { field_id: fieldId, date: today, value: valueToSave }, "return=representation,resolution=merge-duplicates");
      // Only update from server if the value hasn't changed since we sent it
      // (another click may have updated it optimistically while we were saving)
      if (rows && rows[0] && entries[fieldId]?.value === valueToSave) {
        entries[fieldId] = rows[0];
      }
    } catch (err) {
      console.error("Save failed:", err);
    }
  });
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-field-id]");
  if (!btn || btn.disabled) return;

  const fieldId = btn.dataset.fieldId;
  const action = btn.dataset.action;
  const value = btn.dataset.value;
  const field = fields.find((f) => f.id === fieldId);
  if (!field) return;

  let entry = entries[fieldId];
  let newValue;

  if (action === "increment") {
    const cur = entry ? Number(entry.value) : 0;
    newValue = String(cur + 1);
  } else if (action === "set") {
    newValue = value;
  } else if (action === "multi") {
    let selected = [];
    try { selected = entry ? JSON.parse(entry.value) : []; } catch {}
    if (!selected.includes(value)) selected.push(value);
    newValue = JSON.stringify(selected);
  }

  // Optimistic update
  if (entry) {
    entry.value = newValue;
  } else {
    entry = { field_id: fieldId, date: today, value: newValue };
    entries[fieldId] = entry;
  }
  renderCards();

  // Persist (serialized per field)
  enqueueSave(fieldId);
});

// ---- Tab switching ----

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.add("hidden"));
    $(`#tab-${tab.dataset.tab}`).classList.remove("hidden");

    if (tab.dataset.tab === "dashboard") renderDashboard();
    if (tab.dataset.tab === "settings") renderSettings();
  });
});

// ---- Settings tab ----

function renderSettings() {
  const active = fields.filter((f) => f.active !== false);
  const archived = fields.filter((f) => f.active === false);

  $("#fields-list").innerHTML = active.length === 0
    ? `<p class="hint">No active items yet.</p>`
    : active.map((f) => fieldRow(f, false)).join("");

  $("#fields-archived").innerHTML = archived.length === 0
    ? `<p class="hint">No archived items.</p>`
    : archived.map((f) => fieldRow(f, true)).join("");
}

function fieldRow(f, isArchived) {
  const config = f.config || {};
  let desc = f.type;
  if (f.type === "counter") desc = `Counter (${config.max} ${config.unit || "items"})`;
  if (f.type === "select") desc = `Select: ${(config.options || []).join(", ")}`;
  if (f.type === "rating") desc = `Rating 1-${config.max || 5}`;
  if (f.type === "multi") desc = `Multi-select (${config.max}): ${(config.options || []).join(", ")}`;
  if (f.type === "check") desc = "Checkbox";

  let recur = "Daily";
  if (f.recurrence === "every_n_days") recur = `Every ${f.recurrence_days} days (show ${f.show_days_before || 0}d before)`;
  if (f.expires_at) recur += ` &middot; Expires ${f.expires_at}`;

  return `<div class="field-row">
    <span class="field-icon">${f.icon || ""}</span>
    <div class="field-info">
      <strong>${esc(f.label)}</strong>
      <span class="hint">${desc} &middot; ${recur}</span>
    </div>
    <div class="field-actions">
      ${isArchived
        ? `<button class="btn btn-sm" onclick="restoreField('${f.id}')">Restore</button>`
        : `<button class="btn btn-sm btn-danger" onclick="archiveField('${f.id}')">Archive</button>`
      }
      <button class="btn btn-sm btn-danger-outline" onclick="deleteField('${f.id}')">Delete</button>
    </div>
  </div>`;
}

// ---- Add field form ----

const form = $("#add-field-form");

// Show/hide type-specific options
form.querySelector("[name=type]").addEventListener("change", (e) => {
  const t = e.target.value;
  t === "select" ? show($("#type-options")) : hide($("#type-options"));
  t === "counter" ? show($("#type-counter-opts")) : hide($("#type-counter-opts"));
});

form.querySelector("[name=recurrence]").addEventListener("change", (e) => {
  e.target.value === "every_n_days" ? show($("#recurrence-opts")) : hide($("#recurrence-opts"));
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(form);

  const type = fd.get("type");
  const config = {};

  if (type === "counter") {
    config.max = Number(fd.get("max")) || 3;
    config.unit = fd.get("unit") || "items";
  } else if (type === "select") {
    config.options = fd.get("options").split(",").map((s) => s.trim()).filter(Boolean);
    if (config.options.length === 0) { alert("Add at least one option"); return; }
  } else if (type === "rating") {
    config.max = 5;
  } else if (type === "check") {
    // no extra config
  }

  const row = {
    label: fd.get("label").trim(),
    icon: fd.get("icon") || null,
    type,
    config,
    color: fd.get("color"),
    recurrence: fd.get("recurrence"),
    recurrence_days: fd.get("recurrence") === "every_n_days" ? Number(fd.get("recurrence_days")) : null,
    show_days_before: fd.get("recurrence") === "every_n_days" ? Number(fd.get("show_days_before")) : 0,
    expires_at: fd.get("expires_at") || null,
    active: true,
    sort_order: fields.length,
  };

  try {
    const rows = await supaPost("tracker_fields", row);
    if (rows && rows[0]) fields.push(rows[0]);
    form.reset();
    hide($("#type-options"));
    hide($("#type-counter-opts"));
    hide($("#recurrence-opts"));
    renderSettings();
    renderCards();
  } catch (err) {
    console.error(err);
    alert("Failed to add item. Check console.");
  }
});

// ---- Archive / Restore / Delete ----

window.archiveField = async (id) => {
  try {
    await supaPatch("tracker_fields", `id=eq.${id}`, { active: false });
    const f = fields.find((f) => f.id === id);
    if (f) f.active = false;
    renderSettings();
    renderCards();
  } catch (err) { console.error(err); }
};

window.restoreField = async (id) => {
  try {
    await supaPatch("tracker_fields", `id=eq.${id}`, { active: true });
    const f = fields.find((f) => f.id === id);
    if (f) f.active = true;
    renderSettings();
    renderCards();
  } catch (err) { console.error(err); }
};

window.deleteField = async (id) => {
  if (!confirm("Delete this item and all its history? This cannot be undone.")) return;
  try {
    await supaDelete("tracker_entries", `field_id=eq.${id}`);
    await supaDelete("tracker_fields", `id=eq.${id}`);
    fields = fields.filter((f) => f.id !== id);
    delete entries[id];
    renderSettings();
    renderCards();
  } catch (err) { console.error(err); }
};

// ---- Dashboard: Streak + Heatmap ----

async function renderDashboard() {
  if (!allEntries.length) {
    try { await loadRecentEntries(); } catch {}
  }

  const activeFields = fields.filter((f) => f.active !== false && f.recurrence === "daily");
  if (activeFields.length === 0) {
    $("#streak-info").innerHTML = `<p class="hint">Add daily items to see streaks.</p>`;
    $("#heatmap").innerHTML = "";
    return;
  }

  // Build lookup: date -> { field_id -> entry }
  const byDate = {};
  for (const e of allEntries) {
    if (!byDate[e.date]) byDate[e.date] = {};
    byDate[e.date][e.field_id] = e;
  }

  // For each date, check if all active daily fields are done
  function isDayComplete(date) {
    const dayEntries = byDate[date] || {};
    return activeFields.every((f) => isEntryDone(f, dayEntries[f.id]));
  }

  // Current streak
  let currentStreak = 0;
  const d = new Date();
  while (true) {
    const iso = isoDate(d);
    if (isDayComplete(iso)) {
      currentStreak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  // Longest streak + total days
  const from = new Date();
  from.setDate(from.getDate() - 364);
  let longestStreak = 0;
  let streak = 0;
  let totalDays = 0;
  const iter = new Date(from);
  const todayDate = new Date();
  while (iter <= todayDate) {
    const iso = isoDate(iter);
    if (isDayComplete(iso)) {
      streak++;
      totalDays++;
      longestStreak = Math.max(longestStreak, streak);
    } else {
      streak = 0;
    }
    iter.setDate(iter.getDate() + 1);
  }

  $("#streak-info").innerHTML = `
    <div class="streak-stat"><div class="num">${currentStreak}</div><div class="label">Current streak</div></div>
    <div class="streak-stat"><div class="num">${longestStreak}</div><div class="label">Longest streak</div></div>
    <div class="streak-stat"><div class="num">${totalDays}</div><div class="label">Total days</div></div>
  `;

  // Heatmap
  const startDay = new Date(from);
  startDay.setDate(startDay.getDate() - startDay.getDay()); // align to Sunday

  let html = `<h3>Completion heatmap</h3><div class="heatmap-grid">`;
  const hIter = new Date(startDay);
  while (hIter <= todayDate) {
    const iso = isoDate(hIter);
    const dayEntries = byDate[iso] || {};
    const completed = activeFields.filter((f) => isEntryDone(f, dayEntries[f.id])).length;
    const pct = activeFields.length > 0 ? completed / activeFields.length : 0;
    let level = 0;
    if (pct > 0 && pct < 0.33) level = 1;
    else if (pct >= 0.33 && pct < 0.66) level = 2;
    else if (pct >= 0.66 && pct < 1) level = 3;
    else if (pct >= 1) level = 4;

    const label = hIter.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    html += `<div class="heatmap-cell" data-level="${level}" title="${label}: ${completed}/${activeFields.length}"></div>`;
    hIter.setDate(hIter.getDate() + 1);
  }
  html += `</div>`;
  html += `<div class="heatmap-legend">Less <div class="heatmap-cell" data-level="0"></div><div class="heatmap-cell" data-level="1"></div><div class="heatmap-cell" data-level="2"></div><div class="heatmap-cell" data-level="3"></div><div class="heatmap-cell" data-level="4"></div> More</div>`;

  $("#heatmap").innerHTML = html;
}

// ---- Init ----

init();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    today = todayISO();
    Promise.all([loadFields(), loadTodayEntries()]).then(render).catch(console.error);
  }
});
