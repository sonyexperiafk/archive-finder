# Archive Finder Operator Handbook

Archive Finder is a fresh-only designer resale crawler. The goal is simple: keep the live feed clean, keep source setup understandable, and only surface listings that are new enough to matter.

## 1. First Launch

1. Open the app.
2. Read the `Quick Start` modal.
3. Go to `Sources`.
4. Check which marketplaces are `Guest-ready` and which need setup.
5. Go to `Settings` and paste your own brands and tags.

## 2. Source Modes

### Guest-ready now

- `Mercari JP`
- `Vinted`
- `Rakuma`
- `Kufar`

These can be tested without cookies in normal conditions.

### Needs cookies or captured session

- `Carousell`

This source is more protected and usually needs valid cookies or a saved account session.

### Needs proxy plus cookies for stability

- `Avito`

Avito can sometimes work in best-effort mode, but stable operation still needs a proper proxy and healthy cookie packs.

## 3. Cookie Vault

The app supports multiple cookie packs per source.

Use it like this:

1. Open `Sources`.
2. Choose the marketplace in `Cookie Vault`.
3. Paste a raw cookie string, JSON cookie array, or key/value cookie object.
4. Add a label if you want.
5. Save the pack.

If one pack degrades, the engine can move to the next healthy pack automatically.

## 4. Brand Vault and Tag Vault

Open `Settings` and paste one term per line.

Examples:

- `Rick Owens`
- `Guidi`
- `Yohji Yamamoto`
- `archive`
- `horsehide`
- `artisanal`

These terms affect:

- query rotation
- matching
- recommendation reasons
- scoring boosts and penalties

## 5. Clean Manual Test

Use this when you want to verify fresh-only behavior.

1. Open `Settings`.
2. Press `Reset Live State`.
3. Confirm that `Live Feed` is empty.
4. Open `Sources`.
5. Refresh one healthy source.
6. Return to `Live Feed`.

Expected result:

- only genuinely fresh listings should appear
- stale listings should stay out of the live feed

## 6. If The Feed Is Empty

That does not always mean the parser is broken.

Possible reasons:

- there are no listings younger than 60 minutes for the current query mix
- a source is blocked
- cookies are stale
- proxy is missing for Avito
- filters are hiding results

Check in this order:

1. `Sources`
2. `Diagnostics`
3. runtime log file

## 7. What To Watch In Sources

Each source card shows:

- current working state
- access mode
- parsed/new counters
- polling interval

Use that page as the main operational view before opening diagnostics.

## 8. Logs

The app writes runtime issues to a text log file. Use it when something fails repeatedly.

Also keep an eye on:

- recent runs
- parse report
- source health

## 9. Recommended Daily Workflow

1. Check `Live Feed`.
2. Check `Sources` for degraded marketplaces.
3. Refresh or replace cookies if needed.
4. Keep brand vault and tag vault current.
5. Use `Recommendations` after the feed starts receiving fresh inserts.

## 10. Best Practice

- treat public sources as your fast testing lanes
- treat protected sources as higher-maintenance lanes
- do not judge the engine by one empty query
- always test after `Reset Live State` when debugging freshness

## 11. Questions

If someone using the open-source project gets stuck with setup or workflow questions:

- Telegram: [@aloegarten00](https://t.me/aloegarten00)
