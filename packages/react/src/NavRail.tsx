"use client";

import { Trans } from "@lingui/react/macro";
import { Slot, Slottable } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { forwardRef, useEffect, useState } from "react";
import type { LinkProps } from "react-router";
import { Link, useLocation } from "react-router";
import { Drawer, DrawerContent, DrawerTitle } from "./Drawer";
import { Separator } from "./Separator";
import { useSidebar } from "./Sidebar";
import { cn } from "./utils/cn";
import { VStack } from "./VStack";

export const navRailItemClasses = [
  "relative text-foreground/70 hover:text-foreground",
  "h-10 w-10 group-data-[state=expanded]:w-full",
  "flex items-center rounded-md",
  "group-data-[state=collapsed]:justify-center",
  "group-data-[state=expanded]:-space-x-2",
  "font-medium shrink-0 inline-flex items-center justify-center select-none",
  "disabled:opacity-50",
  "transition-[background-color,color,width] duration-100 ease-out",
  "focus:!outline-none focus:!ring-0 active:!outline-none active:!ring-0",
  "after:pointer-events-none after:absolute after:-inset-[3px] after:rounded-lg after:border after:border-blue-500 after:opacity-0 after:ring-2 after:ring-blue-500/20 after:transition-opacity focus-visible:after:opacity-100 active:after:opacity-0",
  "group/item"
];

/**
 * The primary left navigation shared by the ERP and MES app shells: a 56px
 * icon rail that grows to 208px while a mouse hovers it or while it is pinned
 * open (⌘B / a `SidebarTrigger`), and a left drawer below `md`. Open state
 * comes from `SidebarProvider`, so it must be rendered inside one.
 */
export function NavRail({
  children,
  footer,
  forceExpanded = false,
  disableHover = false
}: {
  children: ReactNode;
  footer?: ReactNode;
  /** Hold the rail open regardless of hover or pin (e.g. while rearranging). */
  forceExpanded?: boolean;
  /** Ignore hover, e.g. while a modal owns the pointer. */
  disableHover?: boolean;
}) {
  const { open, isMobile, openMobile, setOpenMobile } = useSidebar();
  const { pathname } = useLocation();
  const [hovered, setHovered] = useState(false);

  // Links, go-to shortcuts and redirects all land here: whatever navigated,
  // the phone drawer must not stay over the destination.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs per navigation
  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  // A Radix dialog toggles document.body pointer-events, and restoring them on
  // close fires a phantom enter on the rail with no paired leave — leaving it
  // stuck expanded. So hover is ignored while `disableHover` is set and cleared
  // on the frame after it changes (after any phantom event has fired).
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the toggle
  useEffect(() => {
    const raf = requestAnimationFrame(() => setHovered(false));
    return () => cancelAnimationFrame(raf);
  }, [disableHover]);

  const content = (
    <VStack spacing={1} className="flex flex-col justify-between h-full px-2">
      <VStack spacing={1}>{children}</VStack>
      {footer ? <VStack spacing={1}>{footer}</VStack> : null}
    </VStack>
  );

  if (isMobile) {
    return (
      <Drawer open={openMobile} onOpenChange={setOpenMobile}>
        <DrawerContent
          position="left"
          size="content"
          className="w-[17rem] max-w-[85vw] p-0"
        >
          <DrawerTitle className="px-6 py-4">
            <Trans>Navigation</Trans>
          </DrawerTitle>
          <nav
            data-state="expanded"
            className="group flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-accent pb-4"
          >
            {content}
          </nav>
        </DrawerContent>
      </Drawer>
    );
  }

  const state = forceExpanded || open || hovered ? "expanded" : "collapsed";

  return (
    // The wrapper (not just the inner nav) grows on expand, so the rail pushes
    // the rest of the layout right instead of floating over it. Sticky so it
    // stays in view in shells whose page scrolls as a whole.
    <div
      data-state={state}
      className={cn(
        "sticky top-0 h-svh flex-col z-50 hidden md:flex shrink-0",
        "w-14 data-[state=expanded]:w-[13rem]",
        "transition-[width] duration-200"
      )}
    >
      <nav
        data-state={state}
        className={cn(
          "bg-background py-2 group z-10 h-full w-full",
          "flex flex-col justify-between",
          "hide-scrollbar overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-accent"
        )}
        onPointerEnter={(event) => {
          // Mouse only: a tap on a touch tablet must not expand the rail.
          if (!disableHover && event.pointerType === "mouse") setHovered(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setHovered(false);
        }}
      >
        {content}
      </nav>
    </div>
  );
}

type NavRailItemProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  icon: ReactNode;
  /** Also the accessible name; the visible label span is aria-hidden. */
  label: string;
  isActive?: boolean;
  tag?: ReactNode;
  /** Shown at the right edge only while expanded (e.g. a shortcut hint). */
  trailing?: ReactNode;
  asChild?: boolean;
  children?: ReactNode;
};

/**
 * One rail entry. A `<button>` by default; with `asChild` the child element
 * becomes the item, so a `Link` or a Radix trigger keeps its own semantics.
 */
export const NavRailItem = forwardRef<HTMLButtonElement, NavRailItemProps>(
  (
    {
      icon,
      label,
      isActive = false,
      tag,
      trailing,
      asChild = false,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : "button"}
        aria-label={label}
        {...props}
        className={cn(
          navRailItemClasses,
          isActive
            ? "bg-active text-active-foreground dark:shadow-button-base"
            : "hover:bg-active/60 hover:text-active-foreground",
          className
        )}
      >
        {/* A 16px icon centred in this 24px box sits where a `left-3 top-3`
            icon would; the box also fits an `Avatar size="xs"`. */}
        <span className="absolute left-2 top-2 flex size-6 items-center justify-center [&>svg]:size-4">
          {icon}
        </span>
        {tag ? (
          <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-medium leading-4 text-center tabular-nums">
            {tag}
          </span>
        ) : null}
        <span
          aria-hidden
          className={cn(
            "min-w-[128px] text-sm text-left",
            "absolute left-7 group-data-[state=expanded]:left-12",
            "opacity-0 group-data-[state=expanded]:opacity-100"
          )}
        >
          {label}
        </span>
        {trailing ? (
          <span
            className={cn(
              "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2",
              "opacity-0 transition-opacity duration-100 group-data-[state=expanded]:opacity-100"
            )}
          >
            {trailing}
          </span>
        ) : null}
        <Slottable>{children}</Slottable>
      </Comp>
    );
  }
);
NavRailItem.displayName = "NavRailItem";

export function NavRailLink({
  to,
  icon,
  label,
  isActive = false,
  tag,
  external = false,
  target,
  rel
}: {
  to: string;
  icon: ReactNode;
  label: string;
  isActive?: boolean;
  tag?: ReactNode;
  external?: boolean;
  target?: LinkProps["target"];
  rel?: string;
}) {
  return (
    <NavRailItem
      asChild
      icon={icon}
      label={label}
      isActive={isActive}
      tag={tag}
    >
      <Link
        to={to}
        target={target}
        rel={rel}
        aria-current={isActive ? "page" : undefined}
        prefetch={external ? "none" : "intent"}
      />
    </NavRailItem>
  );
}

export function NavRailDivider() {
  return (
    <Separator className="my-1 mx-auto w-6 group-data-[state=expanded]:w-full transition-[width] duration-200" />
  );
}
