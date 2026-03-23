# Tracker

A dead-simple daily tracker. Open the page, press buttons, done. Data is stored in Supabase (Postgres).

Completed items disappear for the day and reappear the next morning. A GitHub-style heatmap shows your streak.

## What it tracks

| Item | Interaction | Done when... |
|------|------------|------------|
| Water | "+1 glass" button | 3 glasses logged |
| Coffee | "+1 cup" button | 3 cups logged |
| Exercise | "Hard" or "Soft" button | Either pressed |
| Sleep | "Bad", "Good", or "Perfect" button | Any pressed |
| Mood | Select mood tags | 4 selected |
| Breakfast | Rate 1-5 | Rated |
| Lunch | Rate 1-5 | Rated |
| Dinner | Rate 1-5 | Rated |
| Snacks | Rate 1-5 | Rated |

## Architecture

```
Browser (GitHub Pages)  -->  Supabase REST API  -->  Postgres
```

No Lambda, no middleware. The frontend calls Supabase directly.

## Setup

### 1. Create a Supabase project

1. Go to https://supabase.com and create a free project.
2. In the SQL Editor, run:

```sql
CREATE TABLE daily_logs (
  date DATE PRIMARY KEY,
  water INTEGER DEFAULT 0,
  coffee INTEGER DEFAULT 0,
  exercise TEXT,
  sleep TEXT,
  mood TEXT DEFAULT '[]',
  food_breakfast INTEGER DEFAULT 0,
  food_lunch INTEGER DEFAULT 0,
  food_dinner INTEGER DEFAULT 0,
  food_snacks INTEGER DEFAULT 0
);

-- Allow anonymous reads and writes (personal tracker, no auth needed)
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON daily_logs FOR ALL USING (true) WITH CHECK (true);
```

3. Go to **Settings > API** and copy:
   - **Project URL** (e.g. `https://xxxx.supabase.co`)
   - **anon public** key

### 2. Configure the frontend

Open `app.js` and replace the placeholders:

```js
const SUPABASE_URL = "https://xxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJ...";
```

### 3. Deploy

Host the files on GitHub Pages (or anywhere static). The repo already has a GitHub Actions workflow for Pages deployment.

## Local development

```bash
npx serve .
# opens http://localhost:3000
```

## Analyzing your data

Connect to your Supabase Postgres database with any SQL client:

```sql
-- Weekly averages
SELECT date_trunc('week', date) AS week, AVG(water), AVG(food_breakfast)
FROM daily_logs GROUP BY 1 ORDER BY 1;

-- Days you exercised hard
SELECT date, exercise FROM daily_logs WHERE exercise = 'hard';

-- Completion rate per day
SELECT date,
  (CASE WHEN water >= 3 THEN 1 ELSE 0 END +
   CASE WHEN coffee >= 3 THEN 1 ELSE 0 END +
   CASE WHEN exercise IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN sleep IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN mood != '[]' AND LENGTH(mood) > 5 THEN 1 ELSE 0 END +
   CASE WHEN food_breakfast > 0 THEN 1 ELSE 0 END +
   CASE WHEN food_lunch > 0 THEN 1 ELSE 0 END +
   CASE WHEN food_dinner > 0 THEN 1 ELSE 0 END +
   CASE WHEN food_snacks > 0 THEN 1 ELSE 0 END) AS completed_count
FROM daily_logs ORDER BY date;
```
