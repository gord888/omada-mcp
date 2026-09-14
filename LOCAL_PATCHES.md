# Local Deployment Patches

This deployment is based on `dfla-me/omada-mcp` commit
`0df82dab3af9500db4d090d0d2cce2c0e396bccf` and is maintained in the fork
`gord888/omada-mcp`.

Local hardening changes relative to upstream:

- The three runtime dependencies are pinned to exact, patched versions and the
  lockfile is regenerated to match:
  - `@modelcontextprotocol/sdk` `1.30.0` (upstream ranged `^1.29.0`)
  - `undici` `7.29.1` (upstream ranged `^7.25.0`)
  - `zod` `4.5.4` (upstream ranged `^4.4.3`)
- HTTP redirects are rejected (`redirect: "error"` in `src/omada/http.ts`) so
  OAuth credentials and access tokens can never be forwarded to another origin.
- A read-only `get_switch_ports` tool was added (`safe-read` profile) exposing
  per-port link and PoE telemetry. See `docs/openapi/verified-endpoints.md`.

The deployment runs with an isolated Node.js `20.20.2` runtime, strict TLS,
stdio transport, root-owned source, and separate unprivileged viewer and admin
identities.
