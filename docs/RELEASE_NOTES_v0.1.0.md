# Archive Finder v0.1.0

First public release.

## Included

- mac desktop app build
- fresh-only live feed
- recommendations and liked items
- source control screen with guest/cookie/proxy modes
- cookie vault with multiple packs per source
- custom brand vault and tag vault
- diagnostics and runtime log
- standalone desktop runtime without external Redis requirement

## Source status in this release

- guest-ready: Mercari JP, Vinted, Rakuma, Kufar
- cookies/session required: Carousell
- proxy plus cookies recommended: Avito

## Notes

- mac build is ad-hoc signed
- notarization is not included unless Apple credentials are configured
- some sources still depend on live anti-bot conditions and operator-provided cookies/proxies
