// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

/**
 * Class helpers for MES `/shop` iOS tokens (see `styles/shop-ios.css`).
 * Cheap paint: opaque surfaces, transform/opacity presses, no blur/ping.
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
  /** Compact nav title — large iOS titles waste vertical space on the floor PWA. */
  compactTitle: "text-[17px] font-semibold leading-tight tracking-tight",
  sectionLabel:
    "text-[13px] font-medium uppercase tracking-wide text-[color:var(--shop-muted)]",
  muted: "text-[color:var(--shop-muted)]",
  link: "text-[color:var(--shop-link)] transition-opacity duration-150 ease-out active:opacity-60",
  hairlineTop: "border-t border-[color:var(--shop-hairline)]",
  statusDot: {
    running: "bg-[color:var(--shop-run)]",
    idle: "bg-[color:var(--shop-idle)]",
    break: "bg-[color:var(--shop-break)]",
    down: "bg-[color:var(--shop-down)]"
  },
  statusText: {
    running: "text-[color:var(--shop-run)]",
    idle: "text-[color:var(--shop-muted)]",
    break: "text-[color:var(--shop-break)]",
    down: "text-[color:var(--shop-down)]"
  },
  /**
   * Opaque status fills for machine tiles.
   * Idle = white fill + dark ink; other statuses use solid color + white ink.
   * Tailwind `bg-*` mirrors CSS so a stale shop-ios.css (PWA SW) cannot drift.
   */
  statusFill: {
    running: "shop-ios-fill-running bg-[color:var(--shop-run)]",
    idle: "shop-ios-fill-idle !bg-white text-black",
    break: "shop-ios-fill-break bg-[color:var(--shop-break)]",
    down: "shop-ios-fill-down bg-[color:var(--shop-down)]"
  },
  fillMuted: "shop-ios-fill-muted",
  fillFaint: "shop-ios-fill-faint"
} as const;
