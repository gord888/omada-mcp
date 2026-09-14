# Verified Omada Open API endpoints

Shapes confirmed against a live Omada Controller (`apiVer` 3): the core
endpoints on **6.2.10.17**, and the switch-port/PoE endpoints on **6.2.14.11**
(noted per section).
Sample values are redacted. This file grows as each phase verifies more
endpoints; it is the authoritative reference for what `omada-mcp` actually
relies on.

## Common envelope

Every Open API response is a JSON envelope:

```jsonc
{
  "errorCode": 0,            // 0 = success; non-zero = error
  "msg": "Success.",         // human-readable status / error text
  "result": { /* ... */ }    // payload, present on success
}
```

`errorCode !== 0` must be treated as a failure regardless of HTTP status.

## Paginated list result

List endpoints wrap their items like this:

```jsonc
{
  "totalRows": 1,
  "currentPage": 1,
  "currentSize": 100,
  "data": [ /* items */ ]
}
```

## GET /api/info  (unauthenticated)

Controller discovery. No auth required. Useful to confirm reachability and the
`omadacId`.

```jsonc
{
  "errorCode": 0,
  "msg": "Success.",
  "result": {
    "controllerVer": "6.2.10.17",
    "apiVer": "3",
    "configured": true,
    "type": 1,
    "supportApp": true,
    "omadacId": "<32-char hex>",
    "registeredRoot": true,
    "omadacCategory": "advanced",
    "mspMode": false,
    "omadaCloudUrl": "https://omada.tplinkcloud.com"
  }
}
```

## POST /openapi/authorize/token?grant_type=client_credentials

OAuth2 client-credentials grant. Request body is JSON:

```jsonc
{
  "omadacId": "<OMADA_OMADAC_ID>",
  "client_id": "<OMADA_CLIENT_ID>",
  "client_secret": "<OMADA_CLIENT_SECRET>"
}
```

Response `result`:

```jsonc
{
  "accessToken": "<token>",
  "tokenType": "bearer",
  "expiresIn": 7200,          // seconds
  "refreshToken": "<token>"
}
```

## Authenticated requests — Authorization header

Authenticated Open API calls use a **non-standard** header scheme — the literal
prefix `AccessToken=`, not `Bearer`:

```
Authorization: AccessToken=<accessToken>
```

Confirmed working on 6.2.10.17.

## GET /openapi/v1/{omadacId}/sites

Lists sites. Query params: `page` (1-based), `pageSize`.

`result` is a paginated list; each item:

```jsonc
{
  "siteId": "<24-char hex>",
  "name": "Site Name",
  "region": "Canada",
  "timeZone": "America/Los_Angeles",
  "scenario": "Home",
  "type": 0,
  "supportES": true,
  "supportL2": true,
  "primary": true
}
```

## GET /openapi/v1/{omadacId}/sites/{siteId}/switches/ports/poe-info

Per-port link and PoE telemetry for every adopted switch in the site.
Paginated (`page`, `pageSize`). Verified against Omada **6.2.14.11** on
2026-09-14.

Each row (values redacted):

```jsonc
{
  "port": 8,
  "portName": "Port8",          // configured label — may be anything
  "switchMac": "02-00-00-00-00-01",
  "switchName": "Main Switch",
  "supportPoe": true,           // port hardware supports PoE
  "switchSupportPoe": 1,
  "poe": 1,                     // PoE mode flag (1 observed on all ports)
  "connectedStatus": 1,         // 1 = a device is attached
  "pdClass": "Class4",          // raw controller value; not interpreted
  "power": 9.5,                 // watts
  "voltage": 52.7,              // volts
  "current": 181.0,             // milliamps
  "portStatus": {
    "port": 8,
    "linkStatus": 1,            // 1 = link up
    "linkSpeed": 3,             // see link-speed codes below
    "duplex": 2,
    "poe": true,                // true = currently sourcing power
    "poePower": 9.5,
    "stp": "Forwarding"
  }
}
```

- Measurements are `null` when the port is not delivering power.
- Unit check: `voltage * current / 1000` ≈ `power` (52.7 V × 0.181 A ≈ 9.5 W),
  which is how W/V/mA were confirmed.
- Link-speed codes: 1=10M, 2=100M, 3=1G, 4=2.5G, 5=5G, 6=10G.

## GET /openapi/v1/{omadacId}/sites/{siteId}/switches/ports/switch-detail

Returns an **array**; pass `switchMac` to scope. Verified against Omada
**6.2.14.11** on 2026-09-14. Each entry:

```jsonc
{
  "mac": "02-00-00-00-00-01",
  "name": "Main Switch",
  "model": "SG2016P",
  "downlinkList": [
    { "port": 8, "name": "AP-B", "mac": "...", "ip": "<ip>", "type": "ap" }
  ],
  "clientList": [
    { "port": 16, "name": "test-client", "mac": "...", "ip": "<ip>" }
  ]
}
```

Port number is the only reliable join key between this endpoint and
`poe-info`. Devices attached to a downstream (non-adopted) switch are reported
against that switch's uplink port only, so their individual ports cannot be
resolved.
