# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/) and the
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `get_switch_ports` (`safe-read`) — per-port link and PoE telemetry for the
  site's switches: port number, configured port label, connected client(s),
  link status/speed, and PoE state (active/idle/n-a, W/V/mA, raw PD class).
  Optional strict lookup by port number, port label, or client hostname/IP/MAC;
  an unmatched or ambiguous target is an error. Verified against Omada
  6.2.14.11.

### Changed

- Runtime dependencies pinned to exact, patched versions
  (`@modelcontextprotocol/sdk` 1.30.0, `undici` 7.29.1, `zod` 4.5.4).
- HTTP client now rejects redirects (`redirect: "error"`) so OAuth credentials
  and access tokens can never be forwarded to another origin. See
  `LOCAL_PATCHES.md`.

### Fixed

- `.env` now loads when the server is launched by an MCP client (e.g.
  Claude Desktop) that doesn't set the working directory. The config
  loader now also looks beside the compiled entry point and at an
  explicit `OMADA_DOTENV_PATH` override, in addition to `cwd`. Previously
  the server would fail at startup with "Invalid configuration:
  OMADA_BASE_URL: expected string, received undefined" because `.env`
  wasn't discoverable from the launcher's working directory.

### Docs

- README is now explicit that this release is **local-only**: the server
  speaks stdio only, HTTP transport is not implemented, and there is no
  authentication layer in front of it. The Quick Start leads with the two
  supported paths (Node directly, or a local Docker build) and explains
  that the `ghcr.io/<owner>/omada-mcp:latest` references seen in some
  snippets are placeholders for an image that does not exist.
- `docker-compose.example.yml` is reframed as aspirational — the
  `omada-mcp` service stays commented out until HTTP + auth land.

### Added

- Multi-stage `Dockerfile` and `docker-compose.example.yml` paired with
  `mbentley/omada-controller`.
- `vitest` suite covering capability gating, dry-run diffing, the OAuth2
  token manager (caching, invalidation, concurrent-call coalescing),
  HTTP errorCode handling and Zod shape validation.
- Full `README.md` with the env-var table, tool catalog and security
  notes; `CONTRIBUTING.md` and this `CHANGELOG.md`.
- GitHub Actions CI: lint, typecheck, test and docker build.

### Phase 4b — admin writes (continued)

- `update_ssid` — modify SSID basic config (name, band, broadcast,
  802.11r, PMF, VLAN) via the `update-basic-config` PATCH endpoint.
- `update_ap_radio` — per-AP per-band radio config (channel, width,
  Tx power, radio enable). Both verified live in dry-run.

### Phase 4a — write tools + dry-run framework

- Dry-run framework with diff helpers, action-preview, state-preview
  and post-apply override report.
- `ops-write` tier: `reboot_device`, `block_client`, `unblock_client`,
  `reconnect_client`, `set_site_led`, `set_client_rate_limit`.
- `admin` tier: `update_site_roaming`, `update_band_steering`.

### Phase 2 — read tools

- `list_devices`, `get_device`, `get_ap_radios`, `list_clients`,
  `get_client`, `list_ssids`, `get_ssid`, `get_site_settings`,
  `list_events`, `list_logs`.
- Captured the official TP-Link Omada Open API v1 spec (OpenAPI 3.0.1,
  1,802 endpoints) into `docs/openapi/` plus a tool→endpoint map.

### Phase 1 — auth + first read tool

- OAuth2 client-credentials token manager with caching, refresh and
  concurrent-call coalescing.
- Undici-based HTTP layer with per-client TLS toggle and Omada envelope
  (`errorCode` / `msg` / `result`) handling.
- Typed Open API client with tolerant Zod schemas.
- `list_sites` — the first read tool; verified live against
  Omada Controller 6.2.10.17.

### Phase 0 — scaffold

- Initial repo: strict TypeScript, Biome lint/format, MIT license, env
  template (`.env.example`), minimal stdio MCP server with zero tools.
