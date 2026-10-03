import { describe, expect, it } from "vitest";
import { TELEGRAM_CB_COMPLETE, TELEGRAM_CB_START } from "../constants";
import {
  buildMaintenanceTelegramButtons,
  buildMaintenanceTelegramText
} from "../message";

describe("telegram maintenance helpers", () => {
  it("builds callback_data under Telegram's 64-char limit", () => {
    const dispatchId = "01234567-89ab-cdef-0123-456789abcdef";
    const markup = buildMaintenanceTelegramButtons(dispatchId);
    const row = markup.inline_keyboard[0]!;
    const start = row[0]!.callback_data!;
    const complete = row[1]!.callback_data!;
    expect(start).toBe(`${TELEGRAM_CB_START}${dispatchId}`);
    expect(complete).toBe(`${TELEGRAM_CB_COMPLETE}${dispatchId}`);
    expect(start.length).toBeLessThanOrEqual(64);
    expect(complete.length).toBeLessThanOrEqual(64);
  });

  it("includes shop deep link in assign text", () => {
    const text = buildMaintenanceTelegramText({
      description: "Maintenance dispatch MD-1 for Press assigned to you",
      details: [
        { label: "Priority", value: "High" },
        { label: "Severity", value: "Support Required" }
      ],
      shopUrl: "https://mes.example/shop"
    });
    expect(text).toContain("🔧");
    expect(text).toContain("Priority: High");
    expect(text).toContain("https://mes.example/shop");
  });
});
