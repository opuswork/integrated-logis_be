# Seed data for Swagger bulk import

## Quick start (Swagger)

1. Start backend: `npm run start:dev` (port 3001)
2. Open Swagger: `http://localhost:3001/api-docs` or `http://localhost:3000/swagger`
3. Use **POST /api/members/bulk-import**
4. Copy the entire contents of `members-bulk.json` (or `members-bulk.sample.json`) into the request body
5. Click **Execute**

No JWT is required for bulk-import (same as single signup).

## Excel → JSON workflow

1. Export your Excel sheet as **CSV (UTF-8)**
2. Save as `be/seed/members.csv` with columns:

   | church | fullname | phone | username | password |
   |--------|----------|-------|----------|----------|

   Korean headers also work: `중앙`, `성명`, `phone`, `username`, `password`

3. Run:

   ```bash
   cd be
   node scripts/csv-to-members-bulk-json.mjs seed/members.csv seed/members-bulk.json
   ```

4. Paste `members-bulk.json` into Swagger **POST /api/members/bulk-import**

## Request body shape

```json
{
  "createMissingChurches": true,
  "skipExisting": true,
  "members": [
    {
      "churchName": "서울17",
      "fullname": "이은미",
      "phone": "010-3032-1440",
      "username": "user01030321440",
      "password": "pass01030321440"
    }
  ]
}
```

- **createMissingChurches**: auto-creates `Church` rows from `churchName` (중앙 column)
- **skipExisting**: skips usernames already in DB (safe to re-run)
- Rows with `(총무)` in fullname become the church `assigner`

## Single member (alternative)

Use **POST /api/members** with one object if you only need a few rows:

```json
{
  "fullname": "이은미",
  "username": "user01030321440",
  "phone": "010-3032-1440",
  "password": "pass01030321440",
  "churchId": 1
}
```

Create churches first via **POST /api/churches** or let bulk-import create them.

## Files

| File | Purpose |
|------|---------|
| `members.csv` | Paste/export Excel data here |
| `members-bulk.json` | Generated file for Swagger (run script) |
| `members-bulk.sample.json` | 10-row sample ready to paste |
| `member-single.sample.json` | One-row sample for POST /api/members |
