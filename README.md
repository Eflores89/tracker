# Tracker

A dead-simple daily tracker. Open the page, press buttons, done. Data is stored in a Notion database.

## What it tracks

| Item | Interaction | Done when… |
|------|------------|------------|
| Water | "+1 glass" button | 3 glasses logged |
| Exercise | "Hard" or "Soft" button | Either pressed |
| Sleep | "Bad", "Good", or "Perfect" button | Any pressed |
| Breakfast | Rate 1–5 | Rated |
| Lunch | Rate 1–5 | Rated |
| Dinner | Rate 1–5 | Rated |
| Snacks | Rate 1–5 | Rated |

Once a tracker is complete for the day it disappears from view.

## Architecture

```
Browser  →  API Gateway  →  Lambda  →  Notion API
(HTML/CSS/JS)                          (database)
```

## Setup

### 1. Notion

1. Create a Notion integration at https://www.notion.so/my-integrations and copy the token.
2. Create a Notion database with these properties:
   - `date` — Date
   - `water` — Number
   - `exercise` — Select (options: `hard`, `soft`)
   - `sleep` — Select (options: `bad`, `good`, `perfect`)
   - `food_breakfast` — Number
   - `food_lunch` — Number
   - `food_dinner` — Number
   - `food_snacks` — Number
3. Share the database with your integration.
4. Copy the database ID from the URL (the 32-character hex string).

### 2. Deploy (AWS SAM)

```bash
sam build
sam deploy --guided
```

You will be prompted for:
- `NotionToken` — your Notion integration token
- `NotionDatabaseId` — the database ID from step 1

After deployment, note the `ApiUrl` output.

### 3. Frontend

1. Open `frontend/app.js` and set `API_BASE` to your API Gateway URL.
2. Host the `frontend/` folder anywhere (S3, Netlify, Vercel, or just open `index.html` locally).

## Local development

Serve the frontend locally:

```bash
npm run dev
# opens http://localhost:8080
```

For the API you can use SAM local:

```bash
sam local start-api
```
