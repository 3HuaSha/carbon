import { describe, expect, it } from "vitest";
import { isTelegramCommand } from "../commands";
import { TELEGRAM_CB_COMPLETE } from "../constants";
import {
  buildMaintenanceTelegramButtons,
  buildMaintenanceTelegramDmText,
  buildMaintenanceTelegramGroupText,
  shopDispatchKindLabelZh
} from "../message";

describe("telegram maintenance helpers", () => {
  it("builds Complete-only buttons under Telegram's 64-char limit", () => {
    const dispatchId = "01234567-89ab-cdef-0123-456789abcdef";
    const markup = buildMaintenanceTelegramButtons(dispatchId);
    const row = markup.inline_keyboard[0]!;
    expect(row).toHaveLength(1);
    expect(row[0]!.text).toBe("完成");
    const complete = row[0]!.callback_data!;
    expect(complete).toBe(`${TELEGRAM_CB_COMPLETE}${dispatchId}`);
    expect(complete.length).toBeLessThanOrEqual(64);
  });

  it("labels shop kinds in Chinese", () => {
    expect(shopDispatchKindLabelZh("fault")).toBe("故障");
    expect(shopDispatchKindLabelZh("planned")).toBe("计划停机");
    expect(shopDispatchKindLabelZh("break")).toBe("休息");
    expect(shopDispatchKindLabelZh(null)).toBe("故障");
  });

  it("builds private DM assign text", () => {
    const text = buildMaintenanceTelegramDmText({
      workCenterName: "1号机",
      typeLabel: "故障",
      assignerName: "张三"
    });
    expect(text).toBe(
      [
        "🔧 您有一条新的维修派单",
        "机台：1号机",
        "类型：故障",
        "派单人：张三"
      ].join("\n")
    );
  });

  it("builds group assign text distinct from DM", () => {
    const text = buildMaintenanceTelegramGroupText({
      workCenterName: "1号机",
      typeLabel: "计划停机",
      assigneeName: "李四",
      assignerName: "张三"
    });
    expect(text).toBe(
      [
        "📢 维修动态 · 1号机",
        "类型：计划停机",
        "已指派给 李四（派单人：张三）"
      ].join("\n")
    );
    expect(text).not.toContain("您有一条新的维修派单");
  });

  it("matches group commands with @botusername suffix", () => {
    expect(isTelegramCommand("/setgroup", "setgroup")).toBe(true);
    expect(isTelegramCommand("/setgroup@vivahealthmedia_bot", "setgroup")).toBe(
      true
    );
    expect(
      isTelegramCommand("/setgroup@vivahealthmedia_bot extra", "setgroup")
    ).toBe(true);
    expect(isTelegramCommand("/chatid@vivahealthmedia_bot", "chatid")).toBe(
      true
    );
    expect(isTelegramCommand("/setgroupish", "setgroup")).toBe(false);
    expect(isTelegramCommand("/bind", "setgroup")).toBe(false);
  });

  it("documents Complete-only buttons are for DM (group sends omit markup)", () => {
    const markup = buildMaintenanceTelegramButtons("id");
    expect(markup.inline_keyboard[0]?.[0]?.text).toBe("完成");
  });
});
