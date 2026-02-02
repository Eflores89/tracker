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

  // Exercise: visible until selected
  state.exercise ? hide($("#card-exercise")) : show($("#card-exercise"));

  // Sleep: visible until selected
  state.sleep ? hide($("#card-sleep")) : show($("#card-sleep"));

  // Food: each visible until rated (value > 0)
  const meals = ["food_breakfast", "food_lunch", "food_dinner", "food_snacks"];
  meals.forEach((m) => {
    state[m] > 0 ? hide($(`#card-${m}`)) : show($(`#card-${m}`));
  });

  // All-done check
  const allDone =
    waterDone &&
    state.exercise &&
    state.sleep &&
    meals.every((m) => state[m] > 0);
  allDone ? show($("#all-done")) : hide($("#all-done"));
}

// ---- API calls ----

async function fetchToday() {
  const res = await fetch(GET_TODAY_URL);
  if (!res.ok) throw new Error("Failed to load today's data");
  state = await res.json();
  render();
}

async function track(field, value) {
  const res = await fetch(TRACK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ field, value }),
  });
  if (!res.ok) throw new Error("Failed to save");
  state = await res.json();
  render();
}

// ---- Event listeners ----

document.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-field]");
  if (!btn || btn.disabled) return;

  const field = btn.dataset.field;
  const value = btn.dataset.value ?? null;

  // Disable all buttons in the same card while saving
  const card = btn.closest(".card");
  const buttons = card.querySelectorAll("button");
  buttons.forEach((b) => (b.disabled = true));

  track(field, value)
    .catch((err) => {
      console.error(err);
      alert("Something went wrong. Please try again.");
    })
    .finally(() => {
      buttons.forEach((b) => (b.disabled = false));
    });
});

// ---- Init ----
fetchToday().catch((err) => {
  console.error(err);
  $("#loading").textContent = "Could not load data. Check your connection.";
});
