import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SwitchDetail, SwitchPortPoeItem } from "../../omada/types.js";
import type { ToolContext, ToolModule } from "../types.js";
import { resolveSiteId, runTool } from "../util.js";

/** Compare MACs case-insensitively, ignoring dashes/colons. */
function normalizeMac(mac: string): string {
  return mac.replace(/[-:]/g, "").toLowerCase();
}

/** Human label for an Omada link-speed code (observed on 6.2.14.11). */
export function linkSpeedLabel(code: number | undefined): string {
  switch (code) {
    case 1:
      return "10M";
    case 2:
      return "100M";
    case 3:
      return "1G";
    case 4:
      return "2.5G";
    case 5:
      return "5G";
    case 6:
      return "10G";
    default:
      return "—";
  }
}

function fmtNum(value: number | null | undefined, unit: string): string {
  return value === null || value === undefined ? "—" : `${value} ${unit}`;
}

/** One device attributed to a switch port (from downlinkList or clientList). */
export interface PortDevice {
  name: string;
  ip?: string;
  mac?: string;
}

/** A fully rendered switch-port row plus the fields the lookup matcher needs. */
export interface PortRow {
  switchName: string;
  port: number;
  label: string;
  link: boolean;
  linkSpeed: string;
  poeCapable: boolean;
  poeActive: boolean;
  powerW: number | null | undefined;
  voltage: number | null | undefined;
  currentMa: number | null | undefined;
  pdClass: string;
  devices: PortDevice[];
  line: string;
}

/**
 * Joins per-port PoE telemetry with the switch's own client/downlink
 * attribution. Port number, configured port label, and connected device
 * identity are kept as separate fields — a label is never treated as a
 * device identity.
 */
export function buildPortRows(detail: SwitchDetail, ports: SwitchPortPoeItem[]): PortRow[] {
  const switchName = detail.name ?? detail.mac;
  const byPort = new Map<number, PortDevice[]>();
  const add = (port: number | undefined, entry: PortDevice): void => {
    if (port === undefined) return;
    const list = byPort.get(port);
    if (list) list.push(entry);
    else byPort.set(port, [entry]);
  };
  for (const dl of detail.downlinkList ?? []) {
    add(dl.port, { name: dl.name ?? dl.mac ?? "device", ip: dl.ip, mac: dl.mac });
  }
  for (const cl of detail.clientList ?? []) {
    add(cl.port, { name: cl.name ?? cl.mac ?? "client", ip: cl.ip, mac: cl.mac });
  }

  return [...ports]
    .sort((a, b) => a.port - b.port)
    .map((p) => {
      const ps = p.portStatus ?? {};
      const link = ps.linkStatus === 1 || p.connectedStatus === 1;
      const poeActive = ps.poe === true || (typeof p.power === "number" && p.power > 0);
      const poeCapable = p.supportPoe === true;
      const devices = byPort.get(p.port) ?? [];
      const label = p.portName ?? `Port${p.port}`;
      const deviceText =
        devices.length === 0
          ? "—"
          : devices.map((d) => d.name + (d.ip ? ` (${d.ip})` : "")).join(", ");
      const line =
        `  port ${String(p.port).padStart(2)}  ${label.padEnd(10)}  ` +
        `link=${link ? `up/${linkSpeedLabel(ps.linkSpeed ?? p.linkSpeed)}` : "down"}  ` +
        `poe=${poeActive ? "ACTIVE" : poeCapable ? "idle" : "n/a"}  ` +
        `power=${fmtNum(p.power, "W")}  volt=${fmtNum(p.voltage, "V")}  ` +
        `current=${fmtNum(p.current, "mA")}  class=${p.pdClass ?? "—"}  ` +
        `device=${deviceText}`;
      return {
        switchName,
        port: p.port,
        label,
        link,
        linkSpeed: linkSpeedLabel(ps.linkSpeed ?? p.linkSpeed),
        poeCapable,
        poeActive,
        powerW: p.power,
        voltage: p.voltage,
        currentMa: p.current,
        pdClass: p.pdClass ?? "—",
        devices,
        line,
      };
    });
}

/**
 * Strict lookup across port rows. Accepts a port number, a client
 * hostname/IP/MAC, or a configured port label. Throws on no match and on an
 * ambiguous match (more than one port). This is a report tool, so a bad or
 * ambiguous target is an error, not a silently empty result.
 */
export function matchPortRows(rows: PortRow[], target: string): PortRow {
  const t = target.trim();
  if (t === "") {
    throw new Error("target is empty");
  }

  let matches: PortRow[];
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    matches = rows.filter((r) => r.port === n);
  } else if (/^([0-9a-f]{2}[-:]?){5}[0-9a-f]{2}$/i.test(t)) {
    const want = normalizeMac(t);
    matches = rows.filter((r) => r.devices.some((d) => d.mac && normalizeMac(d.mac) === want));
  } else {
    const lower = t.toLowerCase();
    matches = rows.filter(
      (r) =>
        r.label.toLowerCase() === lower ||
        r.devices.some((d) => d.name.toLowerCase() === lower || (d.ip !== undefined && d.ip === t)),
    );
    if (matches.length === 0) {
      matches = rows.filter(
        (r) =>
          r.label.toLowerCase().includes(lower) ||
          r.devices.some((d) => d.name.toLowerCase().includes(lower)),
      );
    }
  }

  if (matches.length === 0) {
    throw new Error(`No switch port matched "${target}".`);
  }
  if (matches.length > 1) {
    const where = matches.map((r) => `port ${r.port} (${r.label}) on ${r.switchName}`).join(", ");
    throw new Error(`"${target}" is ambiguous — matched ${where}.`);
  }
  const first = matches[0];
  if (!first) {
    throw new Error(`No switch port matched "${target}".`);
  }
  return first;
}

export const getSwitchPortsTool: ToolModule = {
  name: "get_switch_ports",
  tier: "safe-read",
  register(server: McpServer, ctx: ToolContext): void {
    server.registerTool(
      "get_switch_ports",
      {
        title: "Get switch ports (link + PoE)",
        description:
          "Per-port link and PoE telemetry for the site's switches: port number, " +
          "configured port label, connected device(s), link status/speed, and PoE " +
          "state (active/idle/n/a W/V/mA, raw PD class). Optionally look up a single " +
          "port or device via `target` (port number, port label, or client " +
          "hostname/IP/MAC); an unmatched or ambiguous target is an error. Read-only.",
        inputSchema: {
          siteId: z.string().optional().describe("Override the default site (OMADA_SITE_ID)."),
          switchMac: z
            .string()
            .optional()
            .describe("Limit to one switch by MAC. Defaults to all switches at the site."),
          target: z
            .string()
            .optional()
            .describe(
              "Strict lookup: a port number, port label, or client hostname/IP/MAC. " +
                "Errors on no match or an ambiguous match.",
            ),
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async (args) =>
        runTool("get_switch_ports", async () => {
          const siteId = resolveSiteId(ctx, args);

          const devices = await ctx.client.listDevices(siteId);
          let switches = devices.filter((d) => d.type === "switch");
          if (args.switchMac) {
            const want = normalizeMac(args.switchMac);
            switches = switches.filter((d) => normalizeMac(d.mac) === want);
            if (switches.length === 0) {
              throw new Error(`No switch with MAC ${args.switchMac} at site ${siteId}.`);
            }
          }
          if (switches.length === 0) {
            return `No switches found at site ${siteId}.`;
          }

          const allPorts = await ctx.client.listSwitchPortsPoe(siteId);
          const scoped = switches.map((sw) => {
            const ports = allPorts.filter(
              (p) => !p.switchMac || normalizeMac(p.switchMac) === normalizeMac(sw.mac),
            );
            return { sw, ports };
          });

          const details: { sw: (typeof switches)[number]; rows: PortRow[] }[] = [];
          for (const { sw, ports } of scoped) {
            const detail = await ctx.client
              .getSwitchDetail(siteId, sw.mac)
              .catch(() => ({ mac: sw.mac }) as SwitchDetail);
            details.push({ sw, rows: buildPortRows(detail, ports) });
          }

          if (args.target) {
            const allRows = details.flatMap((d) => d.rows);
            const row = matchPortRows(allRows, args.target);
            return [
              `Match for "${args.target}" on ${row.switchName}:`,
              row.line.trim(),
              "",
              "Note: readings are a live snapshot; power draw is transient.",
            ].join("\n");
          }

          const blocks = details.map(({ sw, rows }) => {
            const header =
              `Switch ${sw.name} [${sw.mac}] ${sw.modelName ?? sw.model ?? ""} — ` +
              `${rows.length} port(s):`;
            return [header, ...rows.map((r) => r.line)].join("\n");
          });

          return [
            ...blocks,
            "",
            "Notes:",
            "- poe=ACTIVE means the port is currently sourcing power; idle means the port supports PoE but is not drawing; n/a means the port is not PoE-capable.",
            "- Units: power W, voltage V, current mA. class is the controller's raw PD class and is not interpreted.",
            "- Devices behind a downstream (non-adopted) switch attribute to that switch's uplink port only.",
          ].join("\n");
        }),
    );
  },
};
