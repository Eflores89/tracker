# Tracker

A daily tracker you can customize. Add items, set recurrence, track them with buttons. Data is stored in Supabase (Postgres).

## Features

- **Dynamic items** — add/archive/delete tracker items through the Settings UI
- **Recurrence** — daily items or every-N-days items (e.g. "order groceries every 7 days")
- **Expiry** — temporary items auto-hide after a date (e.g. "vitamin for 10 days")
- **Types** — counter, checkbox, select-one, rating (1-5), multi-select
- **Streak dashboard** — current/longest streak + GitHub-style heatmap
- **Completion hiding** — done items disappear, reappear when due again

## Setup

Follow these steps in order. Total time: ~10 minutes.

### Step 1: Create a Supabase account and project

1. Go to [supabase.com](https://supabase.com) and sign up (free tier is fine).
2. Click **New Project**.
3. Pick a name (e.g. "tracker"), set a database password (you won't need it for this app), and choose a region close to you.
4. Wait for the project to finish provisioning (~2 minutes).

### Step 2: Create the database tables

1. In your Supabase project, click **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Paste this entire block and click **Run**:

```sql
-- Table 1: defines what you track (water, sleep, groceries, etc.)
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

-- Table 2: stores your daily entries (one row per item per day)
CREATE TABLE tracker_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID REFERENCES tracker_fields(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(field_id, date)
);

-- Indexes for fast queries
CREATE INDEX idx_entries_date ON tracker_entries(date);
CREATE INDEX idx_entries_field_date ON tracker_entries(field_id, date);

-- Security: allow anonymous reads and writes (no login required)
ALTER TABLE tracker_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracker_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON tracker_fields FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON tracker_entries FOR ALL USING (true) WITH CHECK (true);
```

You should see "Success. No rows returned." — that's correct.

### Step 3: Load the default tracker items (optional)

If you want the original items (water, coffee, exercise, sleep, mood, meals) pre-loaded so you don't have to create them one by one in the UI:

1. Still in the SQL Editor, click **New query**.
2. Paste and run:

```sql
INSERT INTO tracker_fields (label, icon, type, config, color, recurrence) VALUES
  ('Water',     '💧', 'counter', '{"max": 3, "unit": "glasses"}', 'blue',   'daily'),
  ('Coffee',    '☕', 'counter', '{"max": 3, "unit": "cups"}',    'brown',  'daily'),
  ('Exercise',  '💪', 'select',  '{"options": ["hard", "soft"]}', 'green',  'daily'),
  ('Sleep',     '😴', 'select',  '{"options": ["bad", "good", "perfect"]}', 'purple', 'daily'),
  ('Mood',      '😊', 'multi',   '{"max": 4, "options": ["happy","excited","sad","anxious","depressed","bored","productive","cheerful","energized","tired","angry","nervous"]}', 'pink', 'daily'),
  ('Breakfast', '🥐', 'rating',  '{"max": 5}', 'amber', 'daily'),
  ('Lunch',     '🥗', 'rating',  '{"max": 5}', 'green', 'daily'),
  ('Dinner',    '🍽️', 'rating', '{"max": 5}', 'red',   'daily'),
  ('Snacks',    '🍪', 'rating',  '{"max": 5}', 'amber', 'daily');
```

Skip this step if you want to start fresh and add items yourself in the Settings tab.

### Step 4: Get your Supabase credentials

1. In the Supabase sidebar, click **Settings** (gear icon at the bottom).
2. Click **API** under "Configuration".
3. Copy two values:
   - **Project URL** — looks like `https://abcdefghijk.supabase.co`
   - **anon public** key — the long `eyJ...` string under "Project API keys"

### Step 5: Paste credentials into app.js

Open `app.js` and replace the two placeholders at the top (lines 7-8):

```js
const SUPABASE_URL = "https://abcdefghijk.supabase.co";   // your Project URL
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIs...";      // your anon public key
```

### Step 6: Deploy

Push to GitHub and enable GitHub Pages (Settings > Pages > Source: "GitHub Actions"), or just open `index.html` locally to test.

To test locally:

```bash
npx serve .
```

Then open http://localhost:3000.

## How it works

### Tracking items

Each item has a **type** that determines how you interact with it:

| Type | Example | How it works |
|------|---------|-------------|
| Counter | Water (3 glasses) | Tap "+1" until you hit the target |
| Checkbox | Order groceries | Tap "Done" |
| Select | Sleep quality | Pick one option (bad/good/perfect) |
| Rating | Breakfast (1-5) | Pick a number |
| Multi-select | Mood | Pick up to N tags |

### Recurrence

| Setting | Behavior |
|---------|----------|
| Daily | Shows every day, resets each morning |
| Every N days | After you complete it, hides until N days pass. "Show X days before" makes it appear early as a reminder. |

### Expiry

Set an expiry date for temporary items. After that date, the item stops appearing. You can still see it in Settings under "Archived items."

## Examples

**Son's vitamin (3x/day for 10 days)**:
- Label: "Vitamin C"
- Type: Counter, target: 3, unit: doses
- Recurrence: Daily
- Expires: set to 10 days from today

**Order groceries (weekly)**:
- Label: "Order groceries"
- Type: Checkbox
- Recurrence: Every 7 days, show 2 days before
