# omada-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for the
**TP-Link Omada SDN Controller**. It lets an AI assistant read and safely
modify an Omada network through well-defined, capability-gated tools.

Built as a security-first companion to
[`mbentley/docker-omada-controller`](https://github.com/mbentley/docker-omada-controller).

- Talks to the **Omada Open API** (OAuth2 client-credentials) — *not* the
  internal cookie/CSRF API. The full v1 OpenAPI spec is captured in
  [`docs/openapi/`](docs/openapi/).
- **21 tools** covering reads (sites, devices, clients, SSIDs, site settings,
  events, logs) and writes (reboot, block/unblock/reconnect client, rate
  limit, LED, SSID config, AP radio config, site roaming, band steering).
- **Capability profiles** gate what the assistant can do — `safe-read` is the
  default and exposes only read tools. Writes require explicit opt-in via
  env var.
- Every write tool defaults to `dryRun: true` — preview the diff before
  applying. After apply, the controller is re-read and any silent overrides
  are surfaced.

Verified against **Omada Controller 6.2.10.17** (`apiVer 3`).

## Status — local use only

> **This release is designed to run on the same machine as your MCP client
> (e.g. your laptop running Claude Code or Claude Desktop). It is *not*
> ready to be deployed as a long-lived service on your home server,
> alongside the controller, or anywhere else network-reachable.**
>
> Why:
>
> - The server speaks **stdio only** today. Your MCP client launches it as a
>   subprocess per session and pipes JSON-RPC over stdin/stdout — there is
>   nothing to "connect to" over a network.
> - **HTTP transport is scaffolded but not implemented.** The env-var plumbing
>   exists (`MCP_TRANSPORT`, `MCP_HTTP_ENABLE`, `MCP_HTTP_BIND`,
>   `MCP_HTTP_PORT`) so future work doesn't reshape the project — but today
>   setting `MCP_TRANSPORT=http` throws a clear "use stdio" error.
> - **There is no authentication in front of the server.** If HTTP were
>   enabled today, anything reaching its port could invoke the write tools.
>   A safe hosted deployment needs at minimum Bearer-token auth plus a
>   nginx / VPN topology in front; that's a focused next phase, not a
>   deploy-it-as-is.
>
> So: even though `docker-compose.example.yml` shows the eventual pairing
> with `mbentley/omada-controller`, the only currently-supported deployment
> is **run it locally**, beside whatever MCP client is using it.

## Quick start

### 1. Create an Open API client in the controller

Follow [`docs/SETUP.md`](docs/SETUP.md): in the controller go to
**Settings → Platform Integration → Open API**, create a client-credentials
app, and capture the **client ID**, **client secret** and **omadacId**.

### 2. Configure `.env`

Copy `.env.example` to `.env` in the repo root and fill in:

```ini
OMADA_BASE_URL=https://omada.local:8043
OMADA_CLIENT_ID=...
OMADA_CLIENT_SECRET=...
OMADA_OMADAC_ID=...
OMADA_SITE_ID=...                    # optional; tools require an explicit siteId otherwise
OMADA_VERIFY_TLS=false               # for self-signed controller certs
OMADA_CAPABILITY_PROFILE=safe-read   # safe-read | ops-write | admin
```

`.env` is git-ignored. Keep it on the machine that will run the server.

### 3. Pick a way to run it (choose ONE)

Both options run the server **on whatever machine the MCP client is on**.
There's no operational difference — pick whichever you find simpler.

#### Option A — Node directly (recommended; no Docker needed)

```sh
npm install
npm run build
```

Then point your MCP client at the compiled entry point. For Claude Desktop
that means editing `claude_desktop_config.json`:

```jsonc
{
  "mcpServers": {
    "omada": {
      "command": "node",
      "args": ["/abs/path/to/omada-mcp/dist/index.js"]
    }
  }
}
```

The server finds `.env` automatically — it looks next to the compiled
entry point (i.e. `<repo>/dist/index.js` → `<repo>/.env`), then in the
working directory, then at whatever path `OMADA_DOTENV_PATH` points at.
Any one of those three is enough.

> If the server starts but fails with "Invalid configuration: …" telling
> you the required vars are `undefined`, your `.env` is not where it's
> looking. Either move/copy `.env` next to `dist/index.js`, or set
> `OMADA_DOTENV_PATH` explicitly:
>
> ```jsonc
> {
>   "mcpServers": {
>     "omada": {
>       "command": "node",
>       "args": ["/abs/path/to/omada-mcp/dist/index.js"],
>       "env": {
>         "OMADA_DOTENV_PATH": "/abs/path/to/omada-mcp/.env"
>       }
>     }
>   }
> }
> ```
>
> The MCP client's `env` block is also a perfectly good place to put the
> Omada config inline if you'd rather not keep a `.env` file at all —
> e.g. set `OMADA_BASE_URL`, `OMADA_CLIENT_ID`, `OMADA_CLIENT_SECRET`,
> `OMADA_OMADAC_ID` directly there.

#### Option B — Local Docker build

If you'd rather not have Node installed locally:

```sh
docker build -t omada-mcp:local .
```

This builds the image **on your machine** with the tag `omada-mcp:local`.
No registry is involved. Then in your MCP-client config:

```jsonc
{
  "mcpServers": {
    "omada": {
      "command": "docker",
      "args": ["run", "-i", "--rm",
               "--env-file", "/abs/path/to/omada-mcp/.env",
               "omada-mcp:local"]
    }
  }
}
```

The MCP client runs `docker run -i --rm` per session; the container exits
when the session ends.

### Note on `ghcr.io/<owner>/omada-mcp:latest` references

Some legacy snippets you may see reference an image tag like
`ghcr.io/<owner>/omada-mcp:latest`. **That image does not exist** — it is a
placeholder for a hypothetical published image on GitHub Container Registry.
The CI workflow in this repo **builds the Docker image but does not push it
anywhere** (`push: false`).

You only need a public registry image if you want to install on multiple
machines without each one rebuilding from source. To make that real you'd
need to:

1. Push this repo to GitHub under your own account/org (e.g. `your-name/omada-mcp`).
2. Edit `.github/workflows/ci.yml` to add `permissions: packages: write`, a
   `docker/login-action` step against `ghcr.io`, and flip `push: false` to
   `push: true` with a real tag (`tags: ghcr.io/your-name/omada-mcp:latest`).
3. Reference the resulting image at `ghcr.io/your-name/omada-mcp:latest`.

For a single-laptop setup you don't need any of this — Option A or B above
is the right path.

## Tool catalog

All read tools are tagged `safe-read`. Every write tool defaults to
`dryRun: true` — pass `dryRun: false` to apply.

### Read (`safe-read`)

| Tool | Purpose |
|---|---|
| `list_sites` | List sites on the controller. |
| `list_devices` | APs / switches / gateway at a site, with status & firmware. |
| `get_device` | Per-device detail; for APs, also per-band radio config. |
| `get_ap_radios` | Per-band radio settings on one AP. |
| `list_clients` | Connected clients with SSID, AP, RSSI, traffic. Summary counts. |
| `get_client` | Full client detail. |
| `list_ssids` | SSIDs grouped by WLAN group. |
| `get_ssid` | Full SSID configuration. |
| `get_site_settings` | Aggregate roaming + band-steering + mesh. |
| `get_switch_ports` | Per-port link + PoE telemetry for switches (active/idle/n-a, W/V/mA, raw PD class); optional strict lookup. |
| `list_events` | Site event log within a time window. |
| `list_logs` | Site alert log (with `resolved` filter). |

### Operational writes (`ops-write`)

| Tool | Purpose |
|---|---|
| `reboot_device` | Reboot one AP / switch / gateway. |
| `block_client` / `unblock_client` | Block / allow a client by MAC. |
| `reconnect_client` | Force a client to re-associate. |
| `set_client_rate_limit` | Per-client up / down bandwidth limit. |
| `set_site_led` | Site-wide LED on / off. |

### Admin writes (`admin`)

| Tool | Purpose |
|---|---|
| `update_site_roaming` | Fast roaming, AI roaming, force-disassociation, non-stick. |
| `update_band_steering` | Site band-steering mode. |
| `update_ssid` | Modify SSID basic config (name, band, broadcast, 802.11r, PMF, VLAN). |
| `update_ap_radio` | Per-AP per-band: channel, width, Tx power, radio enable. |

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `OMADA_BASE_URL` | yes | — | Controller URL, no trailing slash. |
| `OMADA_CLIENT_ID` | yes | — | From the Open API app. |
| `OMADA_CLIENT_SECRET` | yes | — | From the Open API app. Never logged. |
| `OMADA_OMADAC_ID` | yes | — | Controller ID. |
| `OMADA_SITE_ID` | no | — | Default site; otherwise tools need `siteId`. |
| `OMADA_VERIFY_TLS` | no | `true` | `false` for self-signed. |
| `OMADA_TIMEOUT_MS` | no | `30000` | HTTP timeout. |
| `OMADA_CAPABILITY_PROFILE` | no | `safe-read` | `safe-read` / `ops-write` / `admin`. |
| `MCP_TRANSPORT` | no | `stdio` | `stdio` only; setting `http` throws today. |
| `MCP_HTTP_ENABLE` | no | `false` | Reserved for the future HTTP transport. |
| `MCP_HTTP_BIND` | no | `127.0.0.1` | Loopback bind when HTTP lands. |
| `MCP_HTTP_PORT` | no | `3000` | |
| `LOG_LEVEL` | no | `info` | `debug` / `info` / `warn` / `error`. |
| `OMADA_DOTENV_PATH` | no | — | Explicit override path to a `.env` file. Useful when the MCP client launches the server without a predictable `cwd`. |

## Security

- Default profile is `safe-read` — writes require an explicit env-var opt-in.
- Every write tool defaults to `dryRun: true`. Apply mode performs a
  GET-merge-PATCH and **re-reads** to surface any controller-side overrides
  (mutually-exclusive settings, silent rejections).
- Credentials are read only from env vars, never from tool arguments, never
  logged, never returned in tool output. The access token is registered with
  the logger so any accidental serialisation is masked.
- **Don't expose this server over a network in its current form.** HTTP
  transport is not yet implemented and there is no authentication layer.
  Run it locally as documented in *Quick start* above.

## Development

```sh
npm install
npm run build         # tsc
npm run typecheck     # tsc --noEmit
npm run lint          # biome check
npm run test          # vitest
```

`docs/openapi/` holds the captured TP-Link Omada Open API v1 spec
(`omada-open-api-v1-spec.json`, OpenAPI 3.0.1) and an `endpoint-map.md`
documenting which Open API endpoint backs each MCP tool.

## Prior art

Three other Omada MCP projects were consulted as references during the
design (all MIT):

- [`MiguelTVMS/tplink-omada-mcp`](https://github.com/MiguelTVMS/tplink-omada-mcp)
- [`realtydev/omada-mcp`](https://github.com/realtydev/omada-mcp)
- [`gaspareduard/Omada-mcp`](https://github.com/gaspareduard/Omada-mcp)

`omada-mcp` is independent code; the differentiator is the security-first
capability tiers, the dry-run framework with post-apply re-read, and
first-class write coverage of SSID / AP-radio / site-roaming config.

## License

MIT — see [LICENSE](LICENSE).
