# Brief tool → Omada Open API endpoint map

Drawn from the official `omada-open-api-v1-spec.json` (captured in this folder,
OpenAPI 3.0.1, 1,802 total endpoints) and confirmed against the live 6.2.10.17
controller. Path prefix elided: every path is rooted at
`/openapi/v1/{omadacId}/sites/{siteId}/...` unless noted.

## Read tools (`safe-read` profile)

| Brief tool         | Method  | Path                                                | Notes                                                  |
| ------------------ | ------- | --------------------------------------------------- | ------------------------------------------------------ |
| `list_sites`       | GET     | `/openapi/v1/{omadacId}/sites`                      | Paginated. ✅ verified Phase 1.                        |
| `list_devices`     | GET     | `devices`                                           | Paginated (`page`+`pageSize` **required**, 400 if absent). ✅ verified. |
| `get_device`       | GET     | `aps/{apMac}` (for APs)                             | Per-device-type — switches/gateways use sibling paths.  |
| `get_ap_radios`    | GET     | `aps/{apMac}/radios` (status) `aps/{apMac}/radio-config` (config) | Two endpoints; tool returns both.                      |
| `get_device_stats` | GET     | `dashboard/channels`, `dashboard/retry-dropped-rate`, `dashboard/top-aps` | Aggregate; site-wide AP stats live in Dashboard. Switch-specific stats at `stat/switches/{mac}`. |
| `list_clients`     | GET     | `clients`                                           | Paginated. ✅ verified. Response also carries `clientStat`/`clientTypeStat` summaries. |
| `get_client`       | GET     | `clients/{clientMac}`                               | Detail; also `client-history`/`client-connection`/`client-timeline` for history. |
| `list_ssids`       | GET     | `wireless-network/ssids`                            | All SSIDs across all WLAN groups in the site.          |
| `get_ssid`         | GET     | `wireless-network/wlans/{wlanId}/ssids/{ssidId}`    | Needs both ids. `list_ssids` items carry both.         |
| `get_site_settings`| GET     | `roaming`, `band-steering`, `mesh`, `led`, `lldp`, `channel-limit`, `beacon-control`, `remember-device` | Composite — `omada-mcp` calls several in parallel and aggregates. |
| `get_switch_ports` | GET     | `switches/ports/poe-info`, `switches/ports/switch-detail?switchMac={mac}` | Per-port link + PoE telemetry; joins `switch-detail` client/downlink attribution by port number. ✅ verified on 6.2.14.11 (2026-09-14). |
| `list_events`      | GET     | `logs/events`                                       | Paginated.                                             |
| `list_logs`        | GET     | `logs/alerts`                                       | Paginated alert log.                                   |

## WLAN groups (helper, not a tool by itself)

`GET wireless-network/wlans` — list WLAN groups; each contains SSIDs. Useful
when `get_ssid` needs the `wlanId`.

## Authentication

`POST /openapi/authorize/token?grant_type=client_credentials` — body
`{omadacId, client_id, client_secret}`. Returns
`{accessToken, tokenType:"bearer", expiresIn:7200, refreshToken}`.

Authenticated requests use the non-standard header:
`Authorization: AccessToken=<accessToken>`.

## Notes / gotchas

- **Pagination is mandatory** on list endpoints (`devices`, `clients`,
  `logs/events`, `logs/alerts`). Missing `page` / `pageSize` → HTTP 400 with a
  Spring-framework error body `{timestamp, status, error, path}` (NOT the
  Omada envelope).
- Device-detail varies by device type — APs at `aps/{apMac}`, switches under
  `switches/{switchMac}`, gateways under `gateways/{gatewayMac}`. The brief's
  single `get_device` will dispatch by `type` from the device-list row.
- The Open API totals **1,802 endpoints**. The MSP-mode (`/openapi/v1/msp/...`)
  and template (`sitetemplates/...`) families are out of scope for the home
  use case `omada-mcp` targets.
