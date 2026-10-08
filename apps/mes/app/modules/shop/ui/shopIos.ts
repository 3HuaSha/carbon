// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

/**
 * Class helpers for MES `/shop` Awwwards cyber-industrial tokens (see `styles/shop-ios.css`).
 */
export const shopIos = {
  page: "shop-ios",
  bar: "shop-ios-bar",
  card: "shop-ios-card",
  inset: "shop-ios-inset",
  segment: "shop-ios-segment",
  segmentItem: "shop-ios-segment-item",
  press: "shop-ios-press",
  pageEnter: "shop-ios-page-enter",
  compactTitle: "text-[16px] font-bold leading-tight tracking-wider uppercase font-mono",
  sectionLabel:
    "text-[12px] font-semibold uppercase tracking-widest text-[color:var(--shop-muted)] font-mono",
  muted: "text-[color:var(--shop-muted)]",
  link: "text-[color:var(--shop-link)] transition-all duration-200 ease-out hover:opacity-100 active:opacity-70",
  hairlineTop: "border-t border-[color:var(--shop-hairline)]",
  statusDot: {
    running: "bg-[color:var(--shop-run)] shadow-[0_0_8px_var(--shop-run)]",
    idle: "bg-[color:var(--shop-idle)] shadow-[0_0_4px_var(--shop-idle)]",
    standby: "bg-[color:var(--shop-standby)] shadow-[0_0_8px_var(--shop-standby)]",
    break: "bg-[color:var(--shop-break)] shadow-[0_0_8px_var(--shop-break)]",
    down: "bg-[color:var(--shop-down)] shadow-[0_0_8px_var(--shop-down)]",
    awaitingStart: "bg-[color:var(--shop-warn)] shadow-[0_0_8px_var(--shop-warn)]",
    offline: "bg-[color:var(--shop-idle)] shadow-[0_0_4px_var(--shop-idle)]"
  },
  statusText: {
    running: "text-[color:var(--shop-run)] font-semibold",
    idle: "text-[color:var(--shop-muted)]",
    standby: "text-[color:var(--shop-standby-text)] font-semibold",
    break: "text-[color:var(--shop-break)] font-semibold",
    down: "text-[color:var(--shop-down)] font-semibold",
    awaitingStart: "text-[color:var(--shop-warn)] font-semibold",
    offline: "text-[color:var(--shop-muted)]"
  },
  statusFill: {
    running: "shop-ios-fill-running",
    idle: "shop-ios-fill-idle",
    standby: "shop-ios-fill-standby",
    break: "shop-ios-fill-break",
    down: "shop-ios-fill-down",
    awaitingStart: "shop-ios-fill-awaiting",
    offline: "shop-ios-fill-offline"
  },
  fillMuted: "shop-ios-fill-muted",
  fillFaint: "shop-ios-fill-faint"
} as const;
