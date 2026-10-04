import { describe, expect, it } from "vitest";
import { parseTelegramSetGroupKind } from "../commands";
import {
  parseTelegramCrewKinds,
  resolveTelegramCrewKind,
  resolveTelegramCrewNotifyTargets
} from "../crew";
import { buildMaintenanceTelegramCompletedText } from "../message";

describe("telegram crew routing", () => {
  it("resolves employeeType names to repair / mold", () => {
    expect(resolveTelegramCrewKind("机修")).toBe("repair");
    expect(resolveTelegramCrewKind("维修班")).toBe("repair");
    expect(resolveTelegramCrewKind("模房")).toBe("mold");
    expect(resolveTelegramCrewKind("Mold Shop")).toBe("mold");
    expect(resolveTelegramCrewKind("主管")).toBeNull();
    expect(resolveTelegramCrewKind("PE")).toBeNull();
  });

  it("routes notify targets by crew with repair fallback", () => {
    expect(
      resolveTelegramCrewNotifyTargets([
        { displayName: "张三", employeeTypeName: "机修" },
        { displayName: "李四", employeeTypeName: "模房" }
      ])
    ).toEqual({ repair: ["张三"], mold: ["李四"] });

    expect(
      resolveTelegramCrewNotifyTargets([
        { displayName: "王五", employeeTypeName: "主管" },
        { displayName: "赵六", employeeTypeName: "PE" }
      ])
    ).toEqual({ repair: ["王五", "赵六"] });
  });

  it("parses /setgroup args (default repair, synonyms, invalid)", () => {
    expect(parseTelegramSetGroupKind("/setgroup")).toBe("repair");
    expect(parseTelegramSetGroupKind("/setgroup@bot")).toBe("repair");
    expect(parseTelegramSetGroupKind("/setgroup repair")).toBe("repair");
    expect(parseTelegramSetGroupKind("/setgroup@bot 维修")).toBe("repair");
    expect(parseTelegramSetGroupKind("/setgroup mold")).toBe("mold");
    expect(parseTelegramSetGroupKind("/setgroup 模房")).toBe("mold");
    expect(parseTelegramSetGroupKind("/setgroup other")).toBeNull();
  });

  it("parses stored telegramCrewKinds", () => {
    expect(parseTelegramCrewKinds(["mold", "repair", "x"])).toEqual([
      "mold",
      "repair"
    ]);
    expect(parseTelegramCrewKinds(null)).toEqual([]);
  });

  it("builds completed replacement text for edited assign messages", () => {
    expect(
      buildMaintenanceTelegramCompletedText({
        workCenterName: "1号机",
        problem: "漏油"
      })
    ).toBe(["已完成 ✓", "机台：1号机", "问题：漏油"].join("\n"));
  });
});
