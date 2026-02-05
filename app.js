/*
 * Tracker — frontend logic.
 *
 * Set these URLs to your deployed Lambda Function URLs, e.g.:
 *   const GET_TODAY_URL = "https://abc123.lambda-url.us-east-1.on.aws/";
 *   const TRACK_URL = "https://def456.lambda-url.us-east-1.on.aws/";
 */
const GET_TODAY_URL = "https://pcfqe76lx4k3nojlnrosr64iom0izkbv.lambda-url.us-east-1.on.aws/";
const TRACK_URL = "https://vrskp6njjbbhbxoyo2j7ipjbay0wnkqb.lambda-url.us-east-1.on.aws/";

// ---- State ----
let state = null;

// ---- Date helper ----
function localTodayISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ---- DOM helpers ----
const $ = (sel) => document.querySelector(sel);
const show = (el) => el.classList.remove("hidden");
const hide = (el) => el.classList.add("hidden");

// ---- Render ----

function render() {
  $("#loading").classList.add("hidden");
  $("#date").textContent = state.date;

  // Water: visible until 3
  const waterDone = state.water >= 3;
  waterDone ? hide($("#card-water")) : show($("#card-water"));
  $("#water-count").textContent = state.water;

  // Coffee: visible until 3
  const coffeeDone = state.coffee >= 3;
  coffeeDone ? hide($("#card-coffee")) : show($("#card-coffee"));
  $("#coffee-count").textContent = state.coffee;

  // Exercise: visible until selected
  state.exercise ? hide($("#card-exercise")) : show($("#card-exercise"));

  // Sleep: visible until selected
  state.sleep ? hide($("#card-sleep")) : show($("#card-sleep"));

  // Mood: visible until 4 selected
  const moodDone = (state.mood?.length ?? 0) >= 4;
  moodDone ? hide($("#card-mood")) : show($("#card-mood"));
  $("#mood-count").textContent = state.mood?.length ?? 0;
  const moodSelect = $("#mood-select");
  for (const opt of moodSelect.options) {
    if (opt.value) {
      opt.disabled = state.mood?.includes(opt.value) ?? false;
    }
  }
  moodSelect.value = "";

  // Food: each visible until rated (value > 0)
  const meals = ["food_breakfast", "food_lunch", "food_dinner", "food_snacks"];
  meals.forEach((m) => {
    state[m] > 0 ? hide($(`#card-${m}`)) : show($(`#card-${m}`));
  });

  // All-done check
  const allDone =
    waterDone &&
    coffeeDone &&
    state.exercise &&
    state.sleep &&
    moodDone &&
    meals.every((m) => state[m] > 0);
  allDone ? show($("#all-done")) : hide($("#all-done"));
}

// ---- Optimistic state update ----

function applyOptimistic(field, value) {
  switch (field) {
    case "water":
      state.water = Math.min((state.water ?? 0) + 1, 3);
      break;
    case "coffee":
      state.coffee = Math.min((state.coffee ?? 0) + 1, 3);
      break;
    case "exercise":
      state.exercise = value;
      break;
    case "sleep":
      state.sleep = value;
      break;
    case "mood":
      if (!state.mood) state.mood = [];
      if (!state.mood.includes(value) && state.mood.length < 4) {
        state.mood = [...state.mood, value];
      }
      break;
    case "food_breakfast":
    case "food_lunch":
    case "food_dinner":
    case "food_snacks":
      state[field] = Number(value);
      break;
  }
}

// ---- API calls ----

async function fetchToday() {
  const date = localTodayISO();
  const res = await fetch(`${GET_TODAY_URL}?date=${date}`);
  if (!res.ok) throw new Error("Failed to load today's data");
  state = await res.json();
  render();
}

function track(field, value) {
  fetch(TRACK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ field, value, date: localTodayISO() }),
  })
    .then((res) => {
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    })
    .then((serverState) => {
      state = serverState;
      render();
    })
    .catch((err) => {
      console.error(err);
    });
}

// ---- Event listeners ----

document.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-field]");
  if (!btn || btn.disabled) return;

  const field = btn.dataset.field;
  const value = btn.dataset.value ?? null;

  // Optimistic: update state and re-render immediately
  const snapshot = JSON.parse(JSON.stringify(state));
  applyOptimistic(field, value);
  render();

  // Fire API in background
  track(field, value);
});

document.addEventListener("change", (e) => {
  if (e.target.id !== "mood-select") return;
  const value = e.target.value;
  if (!value) return;

  applyOptimistic("mood", value);
  render();
  track("mood", value);
});

// ---- Init ----
fetchToday().catch((err) => {
  console.error(err);
  $("#loading").textContent = "Could not load data. Check your connection.";
});
