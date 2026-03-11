# Release Checklist

## Product

- `Live Feed` shows only fresh items
- `Recommendations` use the current scoring model
- `Sources` clearly shows guest/cookie/proxy requirements
- `Settings` supports brand and tag vault editing
- `Diagnostics` shows runtime log and source state

## Runtime

- `npm run lint`
- `npm --workspace server run smoke:sources`
- `npm --workspace server run reset-live-state`
- `npm run desktop:build:mac`

## Desktop

- first launch shows `Quick Start`
- app opens without external Redis
- live feed renders correctly
- no obvious text overlap on desktop and narrow widths

## Open-source

- no secrets committed
- runtime junk ignored
- README updated
- CONTRIBUTING and SECURITY docs present
- issue / PR templates present
- contact info present
