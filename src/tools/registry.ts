import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isToolAllowed } from "../capability.js";
import { logger } from "../logger.js";
import { getApRadiosTool } from "./read/getApRadios.js";
import { getClientTool } from "./read/getClient.js";
import { getDeviceTool } from "./read/getDevice.js";
import { getSiteSettingsTool } from "./read/getSiteSettings.js";
import { getSsidTool } from "./read/getSsid.js";
import { getSwitchPortsTool } from "./read/getSwitchPorts.js";
import { listClientsTool } from "./read/listClients.js";
import { listDevicesTool } from "./read/listDevices.js";
import { listEventsTool } from "./read/listEvents.js";
import { listLogsTool } from "./read/listLogs.js";
import { listSitesTool } from "./read/listSites.js";
import { listSsidsTool } from "./read/listSsids.js";
import type { ToolContext, ToolModule } from "./types.js";
import { blockClientTool } from "./write/blockClient.js";
import { rebootDeviceTool } from "./write/rebootDevice.js";
import { reconnectClientTool } from "./write/reconnectClient.js";
import { setClientRateLimitTool } from "./write/setClientRateLimit.js";
import { setSiteLedTool } from "./write/setSiteLed.js";
import { unblockClientTool } from "./write/unblockClient.js";
import { updateApRadioTool } from "./write/updateApRadio.js";
import { updateBandSteeringTool } from "./write/updateBandSteering.js";
import { updateSiteRoamingTool } from "./write/updateSiteRoaming.js";
import { updateSsidTool } from "./write/updateSsid.js";

/** Every tool the server knows about, in registration order. */
const ALL_TOOLS: readonly ToolModule[] = [
  // safe-read
  listSitesTool,
  listDevicesTool,
  getDeviceTool,
  getApRadiosTool,
  listClientsTool,
  getClientTool,
  listSsidsTool,
  getSsidTool,
  getSiteSettingsTool,
  getSwitchPortsTool,
  listEventsTool,
  listLogsTool,
  // ops-write
  rebootDeviceTool,
  blockClientTool,
  unblockClientTool,
  reconnectClientTool,
  setSiteLedTool,
  setClientRateLimitTool,
  // admin
  updateSiteRoamingTool,
  updateBandSteeringTool,
  updateSsidTool,
  updateApRadioTool,
];

/**
 * Registers only the tools allowed by the active capability profile. Tools
 * above the profile are never registered with the MCP server, so the assistant
 * can neither see nor call them.
 */
export function registerTools(server: McpServer, ctx: ToolContext): void {
  const profile = ctx.config.capabilityProfile;
  const registered: string[] = [];
  const hidden: string[] = [];

  for (const tool of ALL_TOOLS) {
    if (isToolAllowed(tool.tier, profile)) {
      tool.register(server, ctx);
      registered.push(tool.name);
    } else {
      hidden.push(tool.name);
    }
  }

  logger.info(`registered ${registered.length} tool(s) for profile "${profile}"`, {
    tools: registered,
    ...(hidden.length > 0 ? { hiddenByProfile: hidden } : {}),
  });
}
