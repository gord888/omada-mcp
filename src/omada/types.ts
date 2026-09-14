import { z } from "zod";

// ─── Auth ────────────────────────────────────────────────────────────────────

/** Result of the OAuth2 client-credentials token endpoint. */
export const tokenResultSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.string().optional(),
  expiresIn: z.number(),
  refreshToken: z.string().optional(),
});
export type TokenResult = z.infer<typeof tokenResultSchema>;

// ─── Sites ───────────────────────────────────────────────────────────────────

export const siteSchema = z.object({
  siteId: z.string().min(1),
  name: z.string(),
  region: z.string().optional(),
  timeZone: z.string().optional(),
  scenario: z.string().optional(),
  type: z.number().optional(),
  primary: z.boolean().optional(),
});
export type Site = z.infer<typeof siteSchema>;

// ─── Devices ─────────────────────────────────────────────────────────────────

/** A row in `GET /sites/{siteId}/devices`. */
export const deviceListItemSchema = z.object({
  mac: z.string(),
  name: z.string(),
  type: z.string(),
  model: z.string().optional(),
  modelName: z.string().optional(),
  ip: z.string().optional(),
  status: z.number().optional(),
  detailStatus: z.number().optional(),
  modelVersion: z.string().optional(),
  lastSeen: z.number().optional(),
  sn: z.string().optional(),
  firmwareVersion: z.string().optional(),
  deviceSeriesType: z.number().optional(),
  switchConsistent: z.boolean().optional(),
  publicIp: z.string().optional(),
  compatible: z.number().optional(),
});
export type DeviceListItem = z.infer<typeof deviceListItemSchema>;

/** `GET /sites/{siteId}/aps/{apMac}` — AP-specific detail. */
export const apInfoSchema = z.object({
  type: z.string(),
  mac: z.string(),
  name: z.string(),
  ip: z.string().optional(),
  wlanId: z.string().optional(),
  showModel: z.string().optional(),
  firmwareVersion: z.string().optional(),
});
export type ApInfo = z.infer<typeof apInfoSchema>;

/** One radio (per-band) in `aps/{apMac}/radio-config`. */
export const radioSettingSchema = z.object({
  radioEnable: z.boolean().optional(),
  channelWidth: z.string().optional(),
  channel: z.string().optional(),
  txPower: z.number().optional(),
  txPowerLevel: z.number().optional(),
  freq: z.number().optional(),
  wirelessMode: z.number().optional(),
});
export type RadioSetting = z.infer<typeof radioSettingSchema>;

/** `GET /sites/{siteId}/aps/{apMac}/radio-config`. */
export const apRadioConfigSchema = z.object({
  radioSetting2g: radioSettingSchema.optional(),
  radioSetting5g: radioSettingSchema.optional(),
  radioSetting6g: radioSettingSchema.optional(),
});
export type ApRadioConfig = z.infer<typeof apRadioConfigSchema>;

// ─── Clients ─────────────────────────────────────────────────────────────────

/**
 * Row in `GET /sites/{siteId}/clients`. Most fields are optional because they
 * only apply to wireless or wired clients — keep the schema permissive.
 */
export const clientSchema = z.object({
  mac: z.string(),
  name: z.string().optional(),
  hostName: z.string().optional(),
  vendor: z.string().optional(),
  deviceType: z.string().optional(),
  deviceCategory: z.string().optional(),
  osName: z.string().optional(),
  model: z.string().optional(),
  ip: z.string().optional(),
  ipv6List: z.array(z.string()).optional(),
  connectType: z.number().optional(),
  connectDevType: z.string().optional(),
  wireless: z.boolean().optional(),
  ssid: z.string().optional(),
  signalLevel: z.number().optional(),
  signalRank: z.number().optional(),
  wifiMode: z.number().optional(),
  apName: z.string().optional(),
  apMac: z.string().optional(),
  radioId: z.number().optional(),
  channel: z.number().optional(),
  rxRate: z.number().optional(),
  txRate: z.number().optional(),
  powerSave: z.boolean().optional(),
  rssi: z.number().optional(),
  snr: z.number().optional(),
  vid: z.number().optional(),
  trafficDown: z.number().optional(),
  trafficUp: z.number().optional(),
  uptime: z.number().optional(),
  lastSeen: z.number().optional(),
  blocked: z.boolean().optional(),
  guest: z.boolean().optional(),
  active: z.boolean().optional(),
});
export type Client = z.infer<typeof clientSchema>;

/** Summary counters that accompany the clients list. */
export const clientStatSchema = z.object({
  total: z.number().optional(),
  wireless: z.number().optional(),
  wired: z.number().optional(),
  numOffline: z.number().optional(),
  num2g: z.number().optional(),
  num5g: z.number().optional(),
  num6g: z.number().optional(),
  numGuest: z.number().optional(),
  numUser: z.number().optional(),
});
export type ClientStat = z.infer<typeof clientStatSchema>;

/** The whole `clients` response — paginated list + summary. */
export const clientsResponseSchema = z.object({
  totalRows: z.number().optional(),
  currentPage: z.number().optional(),
  currentSize: z.number().optional(),
  data: z.array(clientSchema),
  clientStat: clientStatSchema.optional(),
});
export type ClientsResponse = z.infer<typeof clientsResponseSchema>;

// ─── SSIDs / WLAN groups ────────────────────────────────────────────────────

/** WLAN group from `GET /sites/{siteId}/wireless-network/wlans`. */
export const wlanGroupSchema = z.object({
  wlanId: z.string(),
  name: z.string(),
  primary: z.boolean().optional(),
  clone: z.boolean().optional(),
  site: z.string().optional(),
  resource: z.number().optional(),
});
export type WlanGroup = z.infer<typeof wlanGroupSchema>;

/** SSID row from `GET /sites/{siteId}/wireless-network/wlans/{wlanId}/ssids`. */
export const ssidListItemSchema = z.object({
  ssidId: z.string(),
  name: z.string(),
  band: z.number().optional(),
  guestNetEnable: z.boolean().optional(),
  security: z.number().optional(),
  broadcast: z.boolean().optional(),
  vlanEnable: z.boolean().optional(),
});
export type SsidListItem = z.infer<typeof ssidListItemSchema>;

/**
 * Site-wide SSID overview from `GET /sites/{siteId}/wireless-network/ssids?type=3`.
 * Returns each WLAN group with its SSIDs (id + name only).
 */
export const siteSsidGroupSchema = z.object({
  wlanId: z.string(),
  wlanName: z.string(),
  ssidList: z.array(
    z.object({
      ssidId: z.string(),
      ssidName: z.string(),
    }),
  ),
});
export type SiteSsidGroup = z.infer<typeof siteSsidGroupSchema>;

// ─── Site settings (composite) ───────────────────────────────────────────────

export const roamingSettingSchema = z
  .object({
    roaming: z
      .object({
        fastRoamingEnable: z.boolean().optional(),
        aiRoamingEnable: z.boolean().optional(),
        forceDisassociationEnable: z.boolean().optional(),
        nonStickEnable: z.boolean().optional(),
        dualBand11kReportEnable: z.boolean().optional(),
      })
      .optional(),
  })
  .passthrough();
export type RoamingSetting = z.infer<typeof roamingSettingSchema>;

export const bandSteeringSettingSchema = z
  .object({
    bandSteeringForMultiBand: z
      .object({
        mode: z.number().optional(),
      })
      .optional(),
  })
  .passthrough();
export type BandSteeringSetting = z.infer<typeof bandSteeringSettingSchema>;

export const meshSettingSchema = z
  .object({
    mesh: z
      .object({
        meshEnable: z.boolean().optional(),
        autoFailoverEnable: z.boolean().optional(),
        defGatewayEnable: z.boolean().optional(),
        fullSector: z.boolean().optional(),
      })
      .optional(),
  })
  .passthrough();
export type MeshSetting = z.infer<typeof meshSettingSchema>;

// ─── Site LED ────────────────────────────────────────────────────────────────

export const siteLedSchema = z.object({
  enable: z.boolean(),
});
export type SiteLed = z.infer<typeof siteLedSchema>;

// ─── Client rate limit ───────────────────────────────────────────────────────

/**
 * Custom rate-limit entity. Units: 1 = Kbps, 2 = Mbps. Limit is 1-1024.
 * Used when `mode = 0` (custom mode). Mode 1 uses a profile id instead.
 */
export const customRateLimitSchema = z.object({
  upEnable: z.boolean().optional(),
  upUnit: z.number().int().optional(),
  upLimit: z.number().int().optional(),
  downEnable: z.boolean().optional(),
  downUnit: z.number().int().optional(),
  downLimit: z.number().int().optional(),
});
export type CustomRateLimit = z.infer<typeof customRateLimitSchema>;

// ─── Logs (events + alerts) ─────────────────────────────────────────────────

/** Log items vary widely; keep the schema permissive. */
export const logEntrySchema = z.record(z.string(), z.unknown());
export type LogEntry = z.infer<typeof logEntrySchema>;

export const eventLogResponseSchema = z.object({
  totalRows: z.number().optional(),
  currentPage: z.number().optional(),
  currentSize: z.number().optional(),
  data: z.array(logEntrySchema),
  eventLogStat: z
    .object({
      totalLogNum: z.number().optional(),
      systemLogNum: z.number().optional(),
      deviceLogNum: z.number().optional(),
      clientLogNum: z.number().optional(),
    })
    .optional(),
});
export type EventLogResponse = z.infer<typeof eventLogResponseSchema>;

export const alertLogResponseSchema = z.object({
  totalRows: z.number().optional(),
  currentPage: z.number().optional(),
  currentSize: z.number().optional(),
  data: z.array(logEntrySchema),
  alertLogStat: z
    .object({
      totalLogNum: z.number().optional(),
      unResolvedLogNum: z.number().optional(),
      resolvedLogNum: z.number().optional(),
      systemLogNum: z.number().optional(),
      deviceLogNum: z.number().optional(),
    })
    .optional(),
});
export type AlertLogResponse = z.infer<typeof alertLogResponseSchema>;

// ─── Switch ports / PoE ───────────────────────────────────────────────────────

/** Per-port link + PoE status, as returned inside a `poe-info` row. */
export const portStatusSchema = z
  .object({
    port: z.number().optional(),
    linkStatus: z.number().optional(),
    linkSpeed: z.number().optional(),
    duplex: z.number().optional(),
    poe: z.boolean().optional(),
    poePower: z.number().nullable().optional(),
    tx: z.number().optional(),
    rx: z.number().optional(),
    txRate: z.number().optional(),
    rxRate: z.number().optional(),
    stp: z.string().optional(),
    stpDiscarding: z.boolean().optional(),
  })
  .passthrough();
export type PortStatus = z.infer<typeof portStatusSchema>;

/**
 * One row from `GET /sites/{siteId}/switches/ports/poe-info`.
 * Units (observed on Omada 6.2.14.11): `power` W, `voltage` V, `current` mA.
 * Measurements are `null` when the port is not delivering power.
 */
export const switchPortPoeItemSchema = z
  .object({
    port: z.number(),
    portName: z.string().optional(),
    switchMac: z.string().optional(),
    switchName: z.string().optional(),
    supportPoe: z.boolean().optional(),
    switchSupportPoe: z.number().optional(),
    poe: z.number().optional(),
    connectedStatus: z.number().optional(),
    disable: z.boolean().optional(),
    linkSpeed: z.number().optional(),
    duplex: z.number().optional(),
    poeStatus: z.number().nullable().optional(),
    pdClass: z.string().optional(),
    power: z.number().nullable().optional(),
    voltage: z.number().nullable().optional(),
    current: z.number().nullable().optional(),
    portStatus: portStatusSchema.optional(),
  })
  .passthrough();
export type SwitchPortPoeItem = z.infer<typeof switchPortPoeItemSchema>;

/** A managed downstream device attached to a switch port (`downlinkList`). */
export const switchDownlinkSchema = z
  .object({
    port: z.number().optional(),
    name: z.string().optional(),
    model: z.string().optional(),
    mac: z.string().optional(),
    ip: z.string().optional(),
    type: z.string().optional(),
    linkSpeed: z.number().optional(),
    duplex: z.number().optional(),
  })
  .passthrough();
export type SwitchDownlink = z.infer<typeof switchDownlinkSchema>;

/** A client attributed to a switch port (`clientList`). */
export const switchClientSchema = z
  .object({
    port: z.number().optional(),
    name: z.string().optional(),
    mac: z.string().optional(),
    ip: z.string().optional(),
    deviceType: z.string().optional(),
  })
  .passthrough();
export type SwitchClient = z.infer<typeof switchClientSchema>;

/** One entry from `GET /sites/{siteId}/switches/ports/switch-detail`. */
export const switchDetailSchema = z
  .object({
    type: z.string().optional(),
    mac: z.string(),
    name: z.string().optional(),
    model: z.string().optional(),
    showModel: z.string().optional(),
    ip: z.string().optional(),
    status: z.number().optional(),
    firmwareVersion: z.string().optional(),
    downlinkList: z.array(switchDownlinkSchema).optional(),
    clientList: z.array(switchClientSchema).optional(),
  })
  .passthrough();
export type SwitchDetail = z.infer<typeof switchDetailSchema>;

// ─── Generic helpers ────────────────────────────────────────────────────────

/** Wraps an item schema in the Open API paginated-list envelope. */
export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    totalRows: z.number().optional(),
    currentPage: z.number().optional(),
    currentSize: z.number().optional(),
    data: z.array(item),
  });
}

/**
 * Validates `data` against `schema`, returning the typed value. Throws a clear,
 * actionable error on mismatch — the early-warning system for controller
 * firmware drift or an Open API change.
 */
export function parseApiResult<T>(schema: z.ZodType<T>, data: unknown, context: string): T {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  const issues = result.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new Error(
    `Unexpected response shape from ${context}. The controller may be running an ` +
      `untested firmware version, or the Open API changed. Validation errors:\n${issues}`,
  );
}
