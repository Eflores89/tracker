# Tracker

A daily tracker you can customize. Add items, set recurrence, track them with buttons. Data is stored in Supabase (Postgres).

## Features

- **Dynamic items** — add/archive/delete tracker items through the Settings UI
- **Recurrence** — daily items or every-N-days items (e.g. "order groceries every 7 days")
- **Expiry** — temporary items auto-hide after a date (e.g. "vitamin for 10 days")
- **Types** — counter, checkbox, select-one, rating (1-5), multi-select
- **Streak dashboard** — current/longest streak + GitHub-style heatmap
- **Completion hiding** — done items disappear, reappear when due again

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
-- Field definitions (what you track)
CREATE TABLE tracker_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  icon TEXT,
  type TEXT NOT NULL CHECK (type IN ('counter', 'check', 'select', 'rating', 'multi')),
  config JSONB DEFAULT '{}',
  color TEXT DEFAULT 'blue',
  recurrence TEXT DEFAULT 'daily' CHECK (recurrence IN ('daily', 'every_n_days')),
  recurrence_days INTEGER,
  show_days_before INTEGER DEFAULT 0,
  expires_at DATE,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Entries (daily log values)
CREATE TABLE tracker_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID REFERENCES tracker_fields(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(field_id, date)
);

-- Indexes
CREATE INDEX idx_entries_date ON tracker_entries(date);
CREATE INDEX idx_entries_field_date ON tracker_entries(field_id, date);

-- RLS: allow anonymous access (personal tracker)
ALTER TABLE tracker_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracker_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON tracker_fields FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON tracker_entries FOR ALL USING (true) WITH CHECK (true);
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

### 3. Seed default items (optional)

If you want the original tracker items pre-loaded:

```sql
INSERT INTO tracker_fields (label, icon, type, config, color, recurrence) VALUES
  ('Water',     '💧', 'counter', '{"max": 3, "unit": "glasses"}', 'blue',   'daily'),
  ('Coffee',    '☕', 'counter', '{"max": 3, "unit": "cups"}',    'brown',  'daily'),
  ('Exercise',  '💪', 'select',  '{"options": ["hard", "soft"]}', 'green',  'daily'),
  ('Sleep',     '😴', 'select',  '{"options": ["bad", "good", "perfect"]}', 'purple', 'daily'),
  ('Mood',      '😊', 'multi',   '{"max": 4, "options": ["happy","excited","sad","anxious","depressed","bored","productive","cheerful","energized","tired","angry","nervous"]}', 'pink', 'daily'),
  ('Breakfast',  '🥐', 'rating',  '{"max": 5}', 'amber', 'daily'),
  ('Lunch',      '🥗', 'rating',  '{"max": 5}', 'green', 'daily'),
  ('Dinner',     '🍽️', 'rating', '{"max": 5}', 'red',   'daily'),
  ('Snacks',     '🍪', 'rating',  '{"max": 5}', 'amber', 'daily');
```

### 4. Deploy

Host the files on GitHub Pages (or anywhere static).

## Examples

**Temporary item**: "Son's vitamin — 3 times per day for 10 days"
- Type: Counter, max: 3, unit: doses
- Recurrence: Daily
- Expires: 10 days from now

**Weekly item**: "Order groceries"
- Type: Checkbox
- Recurrence: Every 7 days, show 2 days before

## Local development

```bash
npx serve .
```
