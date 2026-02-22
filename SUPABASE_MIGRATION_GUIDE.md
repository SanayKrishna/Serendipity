# Supabase Migration Guide (Beginner-Friendly)

This guide shows you exactly how to apply the `005_passes_by_and_duration` database migration.

---

## What this migration does

Adds a single new column to the `pins` table:

| Column     | Type    | Default | Purpose                                             |
|------------|---------|---------|-----------------------------------------------------|
| `passes_by`| INTEGER | 0       | Counts users who walked within 20 m but never opened the pin |

---

## Step-by-step instructions

### 1. Open Supabase Dashboard

Go to → **https://app.supabase.com** and log in.

### 2. Select your project

Click on **serendipity-sns** (or whatever you named it) from your projects list.

### 3. Open the SQL Editor

In the left sidebar, click **SQL Editor**.

### 4. Create a new query

Click the **+ New query** button (top-left of the editor panel).

### 5. Paste the migration SQL

Copy everything below and paste it into the editor:

```sql
-- MIGRATION 005: passes_by counter
-- Adds a column that tracks users who walked near a pin but never opened it.

ALTER TABLE pins ADD COLUMN IF NOT EXISTS passes_by INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_pins_passes_by ON pins(id) WHERE passes_by > 0;

-- Verify it worked (this SELECT should return one row)
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'pins' AND column_name = 'passes_by';
```

### 6. Run the query

Click the green **Run** button (or press `Ctrl + Enter` / `Cmd + Enter`).

### 7. Check the result

At the bottom of the editor you should see a result table with **one row**:

| column_name | data_type | column_default |
|-------------|-----------|----------------|
| passes_by   | integer   | 0              |

If you see that row — the migration succeeded. ✅

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `column "passes_by" of relation "pins" already exists` | Migration was already applied — this is fine, `IF NOT EXISTS` prevents duplicates |
| `relation "pins" does not exist` | You haven't run the earlier migrations yet. Run `002_community_and_diary.sql` first via the same SQL Editor |
| Result table is empty after the SELECT | Re-run only the `ALTER TABLE` line, then the SELECT again |

---

## Previous migrations (run these first if starting fresh)

All migration files live in `backend/migrations/`. Run them in order using the same SQL Editor steps above:

1. `002_community_and_diary.sql`
2. `003_add_reports_and_suppression.sql`
3. `004_add_community_pins.sql`
4. **`005_passes_by_and_duration.sql`** ← the one above

---

## After the migration

Restart your backend server so it picks up the new column:

```powershell
# In your backend folder
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

That's it — the `passes_by` counter is now live.
