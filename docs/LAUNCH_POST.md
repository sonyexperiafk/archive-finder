# Archive Finder is public

Archive Finder is now public as an open-source desktop-first resale crawler.

What it is:

- a fresh-only feed for designer resale
- desktop-first workflow
- source control for public and protected marketplaces
- cookie vault with multi-pack fallback
- custom brand and tag tracking
- recommendations that are stricter than a plain brand match

What is working in the public release:

- mac app build
- live feed
- recommendations
- liked items
- sources screen
- diagnostics
- settings for brands, tags, and live reset

Current source model:

- guest-ready: Mercari JP, Vinted, Rakuma, Kufar
- protected: Carousell
- proxy plus cookies recommended: Avito

The goal is not to scrape everything. The goal is to keep the feed cleaner, fresher, and easier to operate.

Design note:

- visual exploration for the current interface was AI-assisted
- the runtime logic, parsers, scoring, queueing, and desktop packaging are in the repo

Repo:

- [https://github.com/sonyexperiafk/archive-finder](https://github.com/sonyexperiafk/archive-finder)

Questions:

- Telegram: [@aloegarten00](https://t.me/aloegarten00)
