# BNI Connect Scraper (local)

This script automates the exact flow you described:
- Login
- Search
- Filters
- Keyword + Country
- Search Members
- Visit each profile and scrape data

## Install

```bash
npm install
npx playwright install
```

## Run

```bash
node scripts/bni-scrape.mjs --keyword "Pool" --country "United States" --url "https://www.bniconnectglobal.com/login/"
```

Optional flags:
- `--headless true|false` (default false)
- `--max 50` to cap profiles
- `--url` to override the login URL

## Notes
- The first run will open a browser for you to log in.
- After you log in, the session is stored at `outputs/bni-storage.json`.
- Results are saved to `outputs/bni-members-*.json` and `.csv`.
- If the site labels differ (e.g., buttons), update selectors in `scripts/bni-scrape.mjs`.
