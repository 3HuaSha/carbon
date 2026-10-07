// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { describe, expect, it } from "vitest";
import {
  countShopMachineTypes,
  filterShopMachinesByType,
  getShopMachineType
} from "./shop.machine-types";

describe("shop machine types", () => {
  it.each([
    ["T1", "T"],
    [" c12 ", "C"],
    ["CM10A", "CM_FM"],
    [" fm4 ", "CM_FM"],
    ["SH8", "SH"],
    ["M22", null],
    ["", null]
  ] as const)("groups %s without overlapping C and CM", (name, type) => {
    expect(getShopMachineType(name)).toBe(type);
  });

  const machines = ["T1", "C2", "CM3A", "FM4", "SH8", "M22"].map((name) => ({
    name
  }));

  it("combines CM and FM and keeps CM out of C", () => {
    expect(filterShopMachinesByType(machines, "C")).toEqual([{ name: "C2" }]);
    expect(filterShopMachinesByType(machines, "CM_FM")).toEqual([
      { name: "CM3A" },
      { name: "FM4" }
    ]);
  });

  it("counts the four machine categories", () => {
    expect(countShopMachineTypes(machines)).toEqual({
      T: 1,
      C: 1,
      CM_FM: 2,
      SH: 1
    });
  });

  it("handles an empty category and empty overview", () => {
    expect(filterShopMachinesByType([{ name: "T1" }], "SH")).toEqual([]);
    expect(countShopMachineTypes([])).toEqual({
      T: 0,
      C: 0,
      CM_FM: 0,
      SH: 0
    });
  });
});
