import { getRowByDate, createRow, parseRow, todayISO } from "../lib/notion.mjs";

export async function handler(event) {
  try {
    const params = new URLSearchParams(event.queryStringParameters || {});
    const date = params.get("date") || todayISO();
    let row = await getRowByDate(date);

    if (!row) {
      row = await createRow(date);
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parseRow(row)),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
}
