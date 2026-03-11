# mac Release Test

Project root:

```bash
cd "/Users/mac/Documents/New project"
```

## 1. Clean live state

```bash
npm --workspace server run reset-live-state
```

Expected:

- live feed is empty
- listings and recommendations tables are cleared
- cookies, sessions and feeds stay intact

## 2. Run source smoke check

```bash
npm --workspace server run smoke:sources
cat data/release-smoke.txt
```

What to look for:

- `kufar` should return listings without cookies
- `rakuma` should return listings without cookies
- `mercari_jp` should return listings without cookies through browser render/API capture
- `vinted` can work in guest mode, but warnings matter:
  - low unresolved-age count is good
  - `403` means rate-limit or bot pressure
- `avito` is best-effort without proxy and may warn
- `carousell` usually still needs valid cookies and may still hit `403`

## 3. Run dev app

```bash
npm run dev
```

Open:

- `http://127.0.0.1:5173`

Check:

- `Live Feed` starts empty after reset
- source strip shows current marketplace state
- `Sources` shows cookie/session state clearly
- `Diagnostics` can load the single runtime text report

## 4. Manual live test

In the app:

1. Open `Sources`
2. Refresh one working source first:
   - `Kufar`
   - `Rakuma`
   - `Mercari JP`
3. Return to `Live Feed`

Expected:

- only new items appear
- items older than 60 minutes do not appear
- cards show source, brand, price, age and score

## 5. Vinted-specific check

Run:

```bash
npx tsx -e "import { fetchVintedSearch } from './server/src/parser/vinted.ts'; (async () => { const r = await fetchVintedSearch('Rick Owens'); console.log(JSON.stringify({ status: r.responseStatus, count: r.listings.length, unknownAge: r.listings.filter(i => !i.postedAt).length, sample: r.listings.slice(0, 5).map(i => ({ title: i.title, postedAt: i.postedAt })) }, null, 2)); })();"
```

Expected:

- `status` is `200`
- `count > 0`
- many items should now have `postedAt`
- unknown-age items should not enter live feed after refresh

## 6. mac desktop build

```bash
npm run desktop:dist:mac
open "release/mac-arm64/Archive Finder.app"
```

Check:

- app launches without external Redis
- onboarding appears on first clean launch
- Sources / Settings / Diagnostics / Live Feed work

## 7. Optional notarized release

If you have Apple credentials:

```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="TEAMID1234"
npm run desktop:dist:mac
```

The build now includes an optional after-sign notarization hook.
