const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function headers() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Query the database for a row matching the given date.
 * Returns the page object or null.
 */
export async function getRowByDate(date) {
  const databaseId = process.env.NOTION_DATABASE_ID;
  const res = await fetch(`${NOTION_API}/databases/${databaseId}/query`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      filter: {
        property: "date",
        date: { equals: date },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Notion query failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.results.length > 0 ? data.results[0] : null;
}

/**
 * Create a new row for the given date with all trackers at defaults.
 */
export async function createRow(date) {
  const databaseId = process.env.NOTION_DATABASE_ID;
  const res = await fetch(`${NOTION_API}/pages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: {
        date: { date: { start: date } },
        water: { number: 0 },
        exercise: { select: null },
        sleep: { select: null },
        food_breakfast: { number: 0 },
        food_lunch: { number: 0 },
        food_dinner: { number: 0 },
        food_snacks: { number: 0 },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Notion create failed: ${res.status} ${await res.text()}`);
  }

  return await res.json();
}

/**
 * Update a page's properties.
 */
export async function updateRow(pageId, properties) {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ properties }),
  });

  if (!res.ok) {
    throw new Error(`Notion update failed: ${res.status} ${await res.text()}`);
  }

  return await res.json();
}

/**
 * Parse the Notion page into a flat object for the frontend.
 */
export function parseRow(page) {
  const p = page.properties;
  return {
    id: page.id,
    date: p.date?.date?.start ?? null,
    water: p.water?.number ?? 0,
    exercise: p.exercise?.select?.name ?? null,
    sleep: p.sleep?.select?.name ?? null,
    food_breakfast: p.food_breakfast?.number ?? 0,
    food_lunch: p.food_lunch?.number ?? 0,
    food_dinner: p.food_dinner?.number ?? 0,
    food_snacks: p.food_snacks?.number ?? 0,
  };
}

export { todayISO };
