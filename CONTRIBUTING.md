# Contributing

Thanks for improving Archive Finder.

## Before opening a PR

1. Run `npm run lint`
2. Run `npm --workspace server run reset-live-state` if your change affects live feed behavior
3. If source behavior changed, run `npm --workspace server run smoke:sources`
4. Keep changes focused and explain operator-facing impact

## What matters most

- stability
- freshness accuracy
- lower noise
- operator clarity
- source resilience

## Good contributions

- parser fixes
- source health improvements
- age normalization improvements
- better recommendation scoring
- cleaner UI for operators
- desktop packaging improvements

## Avoid

- pushing stale listings into the live feed
- adding flashy UI that hurts usability
- hiding source failures instead of surfacing them clearly

## PR notes

Include:

- what changed
- why it changed
- how you tested it
- any source-specific tradeoffs

## Questions

- Telegram: [@aloegarten00](https://t.me/aloegarten00)
