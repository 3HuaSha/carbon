import { beforeEach, describe, expect, it, vi } from "vitest";

const trigger = vi.hoisted(() => vi.fn());

vi.mock("@carbon/jobs", () => ({
  trigger: (...args: unknown[]) => trigger(...args)
}));

describe("notifyScheduleInputsChanged", () => {
  beforeEach(() => {
    trigger.mockReset();
  });

  it("swallows Inngest fetch failures so shop downtime does not 500", async () => {
    trigger.mockRejectedValueOnce(new Error("fetch failed"));
    const { notifyScheduleInputsChanged } = await import("./schedule-notify");

    await expect(
      notifyScheduleInputsChanged(
        "company-1",
        "work-center",
        "Machine downtime reported",
        "wc-1"
      )
    ).resolves.toBeUndefined();

    expect(trigger).toHaveBeenCalledWith("schedule-inputs-changed", {
      companyId: "company-1",
      kind: "work-center",
      reason: "Machine downtime reported",
      entityId: "wc-1"
    });
  });

  it("resolves when Inngest accepts the event", async () => {
    trigger.mockResolvedValueOnce({ ids: ["evt_1"] });
    const { notifyScheduleInputsChanged } = await import("./schedule-notify");

    await expect(
      notifyScheduleInputsChanged(
        "company-1",
        "work-center",
        "Machine downtime reported",
        "wc-1"
      )
    ).resolves.toBeUndefined();
  });
});
