import { cn } from "@carbon/react";
import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { path } from "~/utils/path";

export type ShopTab = "machines" | "repair" | "mold";

const TABS: { id: ShopTab; to: string; label: () => ReactNode }[] = [
  {
    id: "machines",
    to: path.to.shop,
    label: () => <Trans>Machines</Trans>
  },
  {
    id: "repair",
    to: path.to.shopRepair,
    label: () => <Trans>Repair</Trans>
  },
  {
    id: "mold",
    to: path.to.shopMold,
    label: () => <Trans>Mold shop</Trans>
  }
];

type ShopTabNavProps = {
  active: ShopTab;
};

/**
 * Top-level shop PWA tabs: machine grid / repair crew / mold crew.
 * Chinese locale catalogs map Repair→维修, Mold shop→模房, Machines→机台.
 */
export function ShopTabNav({ active }: ShopTabNavProps) {
  return (
    <nav
      className="flex gap-1 rounded-lg bg-muted p-1"
      aria-label="Shop sections"
    >
      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <Link
            key={tab.id}
            to={tab.to}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-center text-sm font-medium transition-colors active:scale-[0.98]",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            )}
            aria-current={selected ? "page" : undefined}
          >
            {tab.label()}
          </Link>
        );
      })}
    </nav>
  );
}
