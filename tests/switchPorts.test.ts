import { describe, expect, it } from "vitest";
import type { SwitchDetail, SwitchPortPoeItem } from "../src/omada/types.js";
import {
  paginatedSchema,
  switchDetailSchema,
  switchPortPoeItemSchema,
} from "../src/omada/types.js";
import { buildPortRows, linkSpeedLabel, matchPortRows } from "../src/tools/read/getSwitchPorts.js";

const SW = "02-00-00-00-00-01";

// Sanitized fixtures modelled on the live `switches/ports/poe-info` shape.
const activePoe: SwitchPortPoeItem = {
  port: 8,
  portName: "Port8",
  switchMac: SW,
  switchName: "Main Switch",
  supportPoe: true,
  switchSupportPoe: 1,
  poe: 1,
  connectedStatus: 1,
  pdClass: "Class4",
  power: 9.5,
  voltage: 52.7,
  current: 181,
  portStatus: { port: 8, linkStatus: 1, linkSpeed: 3, duplex: 2, poe: true, poePower: 9.5 },
};

const idleCapable: SwitchPortPoeItem = {
  port: 4,
  portName: "Port4",
  switchMac: SW,
  supportPoe: true,
  poe: 1,
  connectedStatus: 1,
  pdClass: "--",
  power: 0,
  voltage: 0,
  current: 0,
  portStatus: { port: 4, linkStatus: 1, linkSpeed: 3, poe: false },
};

const disconnected: SwitchPortPoeItem = {
  port: 5,
  portName: "Port5",
  switchMac: SW,
  supportPoe: true,
  poe: 1,
  connectedStatus: 0,
  pdClass: "--",
  power: 0,
  voltage: 0,
  current: 0,
  portStatus: { port: 5, linkStatus: 0, linkSpeed: 1, poe: false },
};

const nonPoe: SwitchPortPoeItem = {
  port: 9,
  portName: "Port9",
  switchMac: SW,
  supportPoe: false,
  poe: 1,
  connectedStatus: 0,
  pdClass: "--",
  power: null,
  voltage: null,
  current: null,
  portStatus: { port: 9, linkStatus: 0, poe: false },
};

const unknownClass: SwitchPortPoeItem = {
  port: 10,
  portName: "Port10",
  switchMac: SW,
  supportPoe: true,
  poe: 1,
  connectedStatus: 1,
  power: 0,
  portStatus: { port: 10, linkStatus: 1, linkSpeed: 3, poe: false },
};

const detail: SwitchDetail = {
  mac: SW,
  name: "Main Switch",
  model: "SG2016P",
  downlinkList: [
    {
      port: 7,
      name: "AP-A",
      model: "EAP650",
      mac: "02-00-00-00-00-03",
      ip: "192.0.2.20",
      type: "ap",
    },
    {
      port: 8,
      name: "AP-B",
      model: "EAP650",
      mac: "02-00-00-00-00-02",
      ip: "192.0.2.21",
      type: "ap",
    },
  ],
  clientList: [
    { port: 8, name: "AP-B", mac: "02-00-00-00-00-02", ip: "192.0.2.21", deviceType: "ap" },
    { port: 16, name: "test-client", mac: "02-00-00-00-00-04", ip: "192.0.2.53" },
  ],
};

describe("linkSpeedLabel", () => {
  it("maps known codes and defaults to an em dash", () => {
    expect(linkSpeedLabel(2)).toBe("100M");
    expect(linkSpeedLabel(3)).toBe("1G");
    expect(linkSpeedLabel(undefined)).toBe("—");
    expect(linkSpeedLabel(99)).toBe("—");
  });
});

describe("buildPortRows", () => {
  it("renders an active PoE port with measurements and device", () => {
    const rows = buildPortRows(detail, [activePoe]);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) return;
    expect(row.poeActive).toBe(true);
    expect(row.line).toContain("poe=ACTIVE");
    expect(row.line).toContain("power=9.5 W");
    expect(row.line).toContain("volt=52.7 V");
    expect(row.line).toContain("current=181 mA");
    expect(row.line).toContain("class=Class4");
    expect(row.line).toContain("AP-B (192.0.2.21)");
  });

  it("marks a PoE-capable but idle port", () => {
    const row = buildPortRows(detail, [idleCapable])[0];
    expect(row?.poeActive).toBe(false);
    expect(row?.poeCapable).toBe(true);
    expect(row?.line).toContain("poe=idle");
    expect(row?.line).toContain("link=up/1G");
  });

  it("distinguishes disconnected and non-PoE ports", () => {
    const rows = buildPortRows(detail, [disconnected, nonPoe]);
    const dis = rows.find((r) => r.port === 5);
    const np = rows.find((r) => r.port === 9);
    expect(dis?.line).toContain("link=down");
    expect(dis?.line).toContain("poe=idle");
    expect(np?.line).toContain("poe=n/a");
    expect(np?.line).toContain("power=—");
  });

  it("renders unknown class without inventing a value", () => {
    const row = buildPortRows(detail, [unknownClass])[0];
    expect(row?.line).toContain("class=—");
    expect(row?.label).toBe("Port10");
    expect(row?.devices).toHaveLength(0);
  });

  it("keeps the configured port label separate from device identity", () => {
    const row = buildPortRows(detail, [{ ...activePoe, portName: "Testing" }])[0];
    expect(row?.label).toBe("Testing");
    expect(row?.devices[0]?.name).toBe("AP-B");
  });
});

describe("matchPortRows", () => {
  const rows = buildPortRows(detail, [activePoe, idleCapable, disconnected]);

  it("matches by port number", () => {
    expect(matchPortRows(rows, "8").port).toBe(8);
  });

  it("matches by label case-insensitively", () => {
    expect(matchPortRows(rows, "port4").port).toBe(4);
  });

  it("matches by device name, IP and MAC", () => {
    expect(matchPortRows(rows, "AP-B").port).toBe(8);
    expect(matchPortRows(rows, "192.0.2.21").port).toBe(8);
    expect(matchPortRows(rows, "02-00-00-00-00-02").port).toBe(8);
  });

  it("throws on no match", () => {
    expect(() => matchPortRows(rows, "does-not-exist")).toThrow(/No switch port matched/);
  });

  it("throws on an ambiguous match", () => {
    const dup: ReturnType<typeof buildPortRows> = [
      ...buildPortRows(detail, [activePoe]),
      ...buildPortRows({ mac: "AA-BB-CC-DD-EE-FF", name: "Other Switch" }, [
        { ...activePoe, switchMac: "AA-BB-CC-DD-EE-FF" },
      ]),
    ];
    expect(() => matchPortRows(dup, "Port8")).toThrow(/ambiguous/);
  });
});

describe("switch port schemas", () => {
  it("parses a realistic poe-info page", () => {
    const page = paginatedSchema(switchPortPoeItemSchema).parse({
      totalRows: 1,
      currentPage: 1,
      currentSize: 100,
      data: [activePoe],
    });
    expect(page.data[0]?.port).toBe(8);
    expect(page.data[0]?.portStatus?.poe).toBe(true);
  });

  it("rejects a non-numeric port", () => {
    expect(() => switchPortPoeItemSchema.parse({ port: "eight" })).toThrow();
  });

  it("parses a switch-detail entry", () => {
    const parsed = switchDetailSchema.parse(detail);
    expect(parsed.downlinkList?.[0]?.name).toBe("AP-A");
    expect(parsed.clientList?.[1]?.name).toBe("test-client");
  });
});
