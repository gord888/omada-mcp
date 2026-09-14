import { z } from "zod";
import type { Config } from "../config.js";
import { logger } from "../logger.js";
import { TokenManager } from "./auth.js";
import { HttpClient, OmadaHttpError, type RequestOptions } from "./http.js";
import {
  type AlertLogResponse,
  type ApInfo,
  type ApRadioConfig,
  alertLogResponseSchema,
  apInfoSchema,
  apRadioConfigSchema,
  type BandSteeringSetting,
  bandSteeringSettingSchema,
  type Client,
  type ClientsResponse,
  type CustomRateLimit,
  clientSchema,
  clientsResponseSchema,
  type DeviceListItem,
  deviceListItemSchema,
  type EventLogResponse,
  eventLogResponseSchema,
  type MeshSetting,
  meshSettingSchema,
  paginatedSchema,
  parseApiResult,
  type RoamingSetting,
  roamingSettingSchema,
  type Site,
  type SiteLed,
  type SiteSsidGroup,
  type SsidListItem,
  type SwitchDetail,
  type SwitchPortPoeItem,
  siteLedSchema,
  siteSchema,
  ssidListItemSchema,
  switchDetailSchema,
  switchPortPoeItemSchema,
  type WlanGroup,
  wlanGroupSchema,
} from "./types.js";

export interface ListOpts {
  page?: number;
  pageSize?: number;
}

/** Compare MACs case-insensitively, ignoring dashes/colons. */
function normalizeMac(mac: string): string {
  return mac.replace(/[-:]/g, "").toLowerCase();
}

export interface LogQueryOpts extends ListOpts {
  timeStartMs: number;
  timeEndMs: number;
  module?: "System" | "Device" | "Client";
}

export interface AlertQueryOpts extends LogQueryOpts {
  resolved?: boolean;
}

/** Typed, thin wrapper over the Omada Open API. */
export class OmadaClient {
  private readonly http: HttpClient;
  private readonly tokens: TokenManager;

  constructor(private readonly config: Config) {
    this.http = new HttpClient({
      verifyTls: config.verifyTls,
      timeoutMs: config.timeoutMs,
    });
    this.tokens = new TokenManager(this.http, config);
  }

  // ─── HTTP plumbing ─────────────────────────────────────────────────────────

  /**
   * Authenticated request against an `/openapi/...` path. The Open API expects
   * a non-standard `Authorization: AccessToken=<token>` header. Retries once,
   * after refreshing the token, on an HTTP 401.
   */
  private async authedRequest(path: string, options: RequestOptions = {}): Promise<unknown> {
    const url = `${this.config.baseUrl}${path}`;
    const send = async (): Promise<unknown> => {
      const token = await this.tokens.getAccessToken();
      return this.http.requestResult(url, {
        ...options,
        headers: { ...options.headers, Authorization: `AccessToken=${token}` },
      });
    };

    try {
      return await send();
    } catch (error) {
      if (error instanceof OmadaHttpError && error.status === 401) {
        logger.warn("received HTTP 401; refreshing token and retrying once");
        this.tokens.invalidate();
        return send();
      }
      throw error;
    }
  }

  private sitePath(siteId: string, suffix: string): string {
    return `/openapi/v1/${this.config.omadacId}/sites/${siteId}${suffix}`;
  }

  // ─── Sites ────────────────────────────────────────────────────────────────

  /** Lists all sites on the controller. */
  async listSites(): Promise<Site[]> {
    const raw = await this.authedRequest(`/openapi/v1/${this.config.omadacId}/sites`, {
      query: { page: 1, pageSize: 100 },
    });
    const page = parseApiResult(
      paginatedSchema(siteSchema),
      raw,
      "GET /openapi/v1/{omadacId}/sites",
    );
    return page.data;
  }

  // ─── Devices ──────────────────────────────────────────────────────────────

  /** Lists APs, switches and gateways at a site. Pagination is required. */
  async listDevices(siteId: string, opts: ListOpts = {}): Promise<DeviceListItem[]> {
    const raw = await this.authedRequest(this.sitePath(siteId, "/devices"), {
      query: { page: opts.page ?? 1, pageSize: opts.pageSize ?? 100 },
    });
    const page = parseApiResult(
      paginatedSchema(deviceListItemSchema),
      raw,
      "GET /sites/{siteId}/devices",
    );
    return page.data;
  }

  /** Detail for one AP. */
  async getApInfo(siteId: string, apMac: string): Promise<ApInfo> {
    const raw = await this.authedRequest(this.sitePath(siteId, `/aps/${apMac}`));
    return parseApiResult(apInfoSchema, raw, `GET /sites/{siteId}/aps/${apMac}`);
  }

  /** Configured per-band radio settings for one AP. */
  async getApRadioConfig(siteId: string, apMac: string): Promise<ApRadioConfig> {
    const raw = await this.authedRequest(this.sitePath(siteId, `/aps/${apMac}/radio-config`));
    return parseApiResult(
      apRadioConfigSchema,
      raw,
      `GET /sites/{siteId}/aps/${apMac}/radio-config`,
    );
  }

  // ─── Switch ports / PoE ───────────────────────────────────────────────────

  /**
   * Per-port link and PoE telemetry for the site's switches. Paginates until
   * `totalRows` is reached, with a hard page cap so a misbehaving controller
   * cannot cause an unbounded loop.
   */
  async listSwitchPortsPoe(siteId: string, opts: ListOpts = {}): Promise<SwitchPortPoeItem[]> {
    const pageSize = opts.pageSize ?? 200;
    const firstPage = opts.page ?? 1;
    const maxPages = 50;
    const items: SwitchPortPoeItem[] = [];
    for (let page = firstPage; page < firstPage + maxPages; page += 1) {
      const raw = await this.authedRequest(this.sitePath(siteId, "/switches/ports/poe-info"), {
        query: { page, pageSize },
      });
      const parsed = parseApiResult(
        paginatedSchema(switchPortPoeItemSchema),
        raw,
        "GET /sites/{siteId}/switches/ports/poe-info",
      );
      items.push(...parsed.data);
      const total = parsed.totalRows;
      if (parsed.data.length === 0 || (total !== undefined && items.length >= total)) {
        break;
      }
    }
    return items;
  }

  /** Detail (including per-port client/downlink attribution) for one switch. */
  async getSwitchDetail(siteId: string, switchMac: string): Promise<SwitchDetail> {
    const raw = await this.authedRequest(this.sitePath(siteId, "/switches/ports/switch-detail"), {
      query: { switchMac },
    });
    const list = parseApiResult(
      z.array(switchDetailSchema),
      raw,
      "GET /sites/{siteId}/switches/ports/switch-detail",
    );
    const want = normalizeMac(switchMac);
    const match = list.find((d) => normalizeMac(d.mac) === want) ?? list[0];
    if (!match) {
      throw new Error(`switch-detail returned no entry for ${switchMac}`);
    }
    return match;
  }

  // ─── Clients ──────────────────────────────────────────────────────────────

  /** Lists connected clients (wired + wireless) at a site, with summary counts. */
  async listClients(siteId: string, opts: ListOpts = {}): Promise<ClientsResponse> {
    const raw = await this.authedRequest(this.sitePath(siteId, "/clients"), {
      query: { page: opts.page ?? 1, pageSize: opts.pageSize ?? 100 },
    });
    return parseApiResult(clientsResponseSchema, raw, "GET /sites/{siteId}/clients");
  }

  /** Full detail for one client. */
  async getClient(siteId: string, clientMac: string): Promise<Client> {
    const raw = await this.authedRequest(this.sitePath(siteId, `/clients/${clientMac}`));
    return parseApiResult(clientSchema, raw, `GET /sites/{siteId}/clients/${clientMac}`);
  }

  // ─── SSIDs / WLAN groups ──────────────────────────────────────────────────

  async listWlanGroups(siteId: string): Promise<WlanGroup[]> {
    const raw = await this.authedRequest(this.sitePath(siteId, "/wireless-network/wlans"));
    return parseApiResult(
      z.array(wlanGroupSchema),
      raw,
      "GET /sites/{siteId}/wireless-network/wlans",
    );
  }

  /**
   * Site-wide SSID overview — each WLAN group with all of its configured SSIDs.
   * The site-wide `/wireless-network/ssids` endpoint only reports SSIDs that
   * are currently being broadcast, so this composes the WLAN-group list with
   * each group's full SSID list instead.
   */
  async listSiteSsids(siteId: string): Promise<SiteSsidGroup[]> {
    const wlans = await this.listWlanGroups(siteId);
    return Promise.all(
      wlans.map(async (wlan) => {
        const ssids = await this.listSsidsInWlan(siteId, wlan.wlanId);
        return {
          wlanId: wlan.wlanId,
          wlanName: wlan.name,
          ssidList: ssids.map((s) => ({ ssidId: s.ssidId, ssidName: s.name })),
        };
      }),
    );
  }

  /** SSIDs within one WLAN group (paginated). */
  async listSsidsInWlan(
    siteId: string,
    wlanId: string,
    opts: ListOpts = {},
  ): Promise<SsidListItem[]> {
    const raw = await this.authedRequest(
      this.sitePath(siteId, `/wireless-network/wlans/${wlanId}/ssids`),
      { query: { page: opts.page ?? 1, pageSize: opts.pageSize ?? 100 } },
    );
    const page = parseApiResult(
      paginatedSchema(ssidListItemSchema),
      raw,
      `GET /sites/{siteId}/wireless-network/wlans/${wlanId}/ssids`,
    );
    return page.data;
  }

  /** Full SSID detail by (wlanId, ssidId). */
  async getSsid(siteId: string, wlanId: string, ssidId: string): Promise<unknown> {
    return this.authedRequest(
      this.sitePath(siteId, `/wireless-network/wlans/${wlanId}/ssids/${ssidId}`),
    );
  }

  // ─── Site settings (read-side) ────────────────────────────────────────────

  async getSiteRoaming(siteId: string): Promise<RoamingSetting> {
    const raw = await this.authedRequest(this.sitePath(siteId, "/roaming"));
    return parseApiResult(roamingSettingSchema, raw, "GET /sites/{siteId}/roaming");
  }

  async getSiteBandSteering(siteId: string): Promise<BandSteeringSetting> {
    const raw = await this.authedRequest(this.sitePath(siteId, "/band-steering"));
    return parseApiResult(bandSteeringSettingSchema, raw, "GET /sites/{siteId}/band-steering");
  }

  async getSiteMesh(siteId: string): Promise<MeshSetting> {
    const raw = await this.authedRequest(this.sitePath(siteId, "/mesh"));
    return parseApiResult(meshSettingSchema, raw, "GET /sites/{siteId}/mesh");
  }

  // ─── Logs ─────────────────────────────────────────────────────────────────

  async listEvents(siteId: string, opts: LogQueryOpts): Promise<EventLogResponse> {
    const raw = await this.authedRequest(this.sitePath(siteId, "/logs/events"), {
      query: {
        page: opts.page ?? 1,
        pageSize: opts.pageSize ?? 50,
        "filters.timeStart": opts.timeStartMs,
        "filters.timeEnd": opts.timeEndMs,
        "filters.module": opts.module,
      },
    });
    return parseApiResult(eventLogResponseSchema, raw, "GET /sites/{siteId}/logs/events");
  }

  async listAlerts(siteId: string, opts: AlertQueryOpts): Promise<AlertLogResponse> {
    const raw = await this.authedRequest(this.sitePath(siteId, "/logs/alerts"), {
      query: {
        page: opts.page ?? 1,
        pageSize: opts.pageSize ?? 50,
        "filters.timeStart": opts.timeStartMs,
        "filters.timeEnd": opts.timeEndMs,
        "filters.module": opts.module,
        "filters.resolved": opts.resolved === undefined ? undefined : String(opts.resolved),
      },
    });
    return parseApiResult(alertLogResponseSchema, raw, "GET /sites/{siteId}/logs/alerts");
  }

  // ─── Site LED (ops-write) ─────────────────────────────────────────────────

  async getSiteLed(siteId: string): Promise<SiteLed> {
    const raw = await this.authedRequest(this.sitePath(siteId, "/led"));
    return parseApiResult(siteLedSchema, raw, "GET /sites/{siteId}/led");
  }

  /** Site-wide LED on/off. The Open API does not expose a per-device LED. */
  async setSiteLed(siteId: string, enable: boolean): Promise<void> {
    await this.authedRequest(this.sitePath(siteId, "/led"), {
      method: "PUT",
      body: { enable },
    });
  }

  // ─── Device + client actions (ops-write) ──────────────────────────────────

  async rebootDevice(siteId: string, deviceMac: string): Promise<void> {
    await this.authedRequest(this.sitePath(siteId, `/devices/${deviceMac}/reboot`), {
      method: "POST",
    });
  }

  async blockClient(siteId: string, clientMac: string): Promise<void> {
    await this.authedRequest(this.sitePath(siteId, `/clients/${clientMac}/block`), {
      method: "POST",
    });
  }

  async unblockClient(siteId: string, clientMac: string): Promise<void> {
    await this.authedRequest(this.sitePath(siteId, `/clients/${clientMac}/unblock`), {
      method: "POST",
    });
  }

  async reconnectClient(siteId: string, clientMac: string): Promise<void> {
    await this.authedRequest(this.sitePath(siteId, `/clients/${clientMac}/reconnect`), {
      method: "POST",
    });
  }

  async setClientRateLimit(
    siteId: string,
    clientMac: string,
    body: {
      mode: number;
      rateLimitProfileId?: string;
      customRateLimit?: CustomRateLimit;
    },
  ): Promise<void> {
    await this.authedRequest(this.sitePath(siteId, `/clients/${clientMac}/ratelimit`), {
      method: "PATCH",
      body,
    });
  }

  // ─── Site settings (admin writes) ─────────────────────────────────────────

  async updateSiteRoaming(siteId: string, body: unknown): Promise<void> {
    await this.authedRequest(this.sitePath(siteId, "/roaming"), {
      method: "PATCH",
      body,
    });
  }

  async updateBandSteering(siteId: string, body: unknown): Promise<void> {
    await this.authedRequest(this.sitePath(siteId, "/band-steering"), {
      method: "PATCH",
      body,
    });
  }

  /**
   * PATCH AP radio config. The endpoint accepts the full multi-band object;
   * callers should GET first, merge in changes for the chosen band, then send
   * the full body back (see brief §5 lesson 1).
   */
  async updateApRadioConfig(siteId: string, apMac: string, body: unknown): Promise<void> {
    await this.authedRequest(this.sitePath(siteId, `/aps/${apMac}/radio-config`), {
      method: "PATCH",
      body,
    });
  }

  /**
   * PATCH SSID basic config. The endpoint declares 9 required fields, so
   * callers should GET the current SSID, merge in changes, and send the
   * full body.
   */
  async updateSsidBasicConfig(
    siteId: string,
    wlanId: string,
    ssidId: string,
    body: unknown,
  ): Promise<void> {
    await this.authedRequest(
      this.sitePath(
        siteId,
        `/wireless-network/wlans/${wlanId}/ssids/${ssidId}/update-basic-config`,
      ),
      { method: "PATCH", body },
    );
  }
}
