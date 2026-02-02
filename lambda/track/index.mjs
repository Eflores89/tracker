import {
  getRowByDate,
  createRow,
  updateRow,
  parseRow,
  todayISO,
} from "../lib/notion.mjs";

const VALID_FIELDS = [
  "water",
  "exercise",
  "sleep",
  "food_breakfast",
  "food_lunch",
  "food_dinner",
  "food_snacks",
];

/**
 * Build the Notion properties patch for a given field + value.
 */
function buildPatch(field, value, currentRow) {
  switch (field) {
    case "water": {
      const current = currentRow.water ?? 0;
      const next = Math.min(current + 1, 3);
      return { water: { number: next } };
    }
    case "exercise":
      return { exercise: { select: { name: value } } };
    case "sleep":
      return { sleep: { select: { name: value } } };
    case "food_breakfast":
    case "food_lunch":
    case "food_dinner":
    case "food_snacks":
      return { [field]: { number: Number(value) } };
    default:
      throw new Error(`Unknown field: ${field}`);
  }
}

export async function handler(event) {
  try {
    const body = JSON.parse(event.body);
    const { field, value } = body;

    if (!field || !VALID_FIELDS.includes(field)) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: `Invalid field: ${field}` }),
      };
    }

    const date = todayISO();
    let row = await getRowByDate(date);

    if (!row) {
      row = await createRow(date);
    }

    const parsed = parseRow(row);
    const patch = buildPatch(field, value, parsed);

    const updated = await updateRow(row.id, patch);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parseRow(updated)),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
