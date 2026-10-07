// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { cn } from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import Avatar from "~/components/Avatar";
import { path } from "~/utils/path";
import type {
  ShopCrewBoard,
  ShopCrewKind,
  ShopCrewMember,
  ShopCrewTask
} from "../shop.types";
import { shopIos } from "./shopIos";

type ShopCrewPageProps = {
  board: ShopCrewBoard;
};

const CREW_TITLE: Record<ShopCrewKind, () => ReactNode> = {
  repair: () => <Trans>Repair</Trans>,
  mold: () => <Trans>Mold shop</Trans>
};

function taskInlineLabel(task: ShopCrewTask): string {
  const machineName = task.workCenterName?.trim() || "—";
  const note = task.note?.trim();
  // One truncated line: `T1 · T2（note）` — note sticks to its machine.
  return note ? `${machineName}（${note}）` : machineName;
}

function MemberRow({
  member,
  showHairline
}: {
  member: ShopCrewMember;
  showHairline: boolean;
}) {
  const navigate = useNavigate();
  const idle = member.tasks.length === 0;
  const primaryTask = member.tasks[0];
  const canOpen = Boolean(primaryTask?.workCenterId);
  const tasksLabel = member.tasks.map(taskInlineLabel).join(" · ");

  return (
    <li className={cn(showHairline && shopIos.hairlineTop)}>
      <button
        type="button"
        onClick={() => {
          if (primaryTask?.workCenterId) {
            navigate(path.to.shopMachine(primaryTask.workCenterId));
          }
        }}
        disabled={!canOpen}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2.5 text-left",
          canOpen && shopIos.press
        )}
      >
        <Avatar name={member.name} path={member.avatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold leading-tight">
            {member.name}
          </div>
          <div className={cn("mt-0.5 truncate text-[13px]", shopIos.muted)}>
            {idle ? <Trans>Idle</Trans> : tasksLabel}
          </div>
        </div>
      </button>
    </li>
  );
}

export function ShopCrewPage({ board }: ShopCrewPageProps) {
  const { t } = useLingui();
  const busyCount = board.members.filter((m) => m.tasks.length > 0).length;

  return (
    <div
      className={cn(
        "mx-auto flex min-h-dvh w-full max-w-3xl flex-col",
        shopIos.pageEnter
      )}
    >
      <header
        className={cn(
          "sticky top-0 z-10 px-4 pt-3 pb-2 space-y-2",
          shopIos.bar
        )}
      >
        <h1 className="sr-only">{CREW_TITLE[board.crew]()}</h1>
        <p className={cn("truncate text-[13px] tabular-nums", shopIos.muted)}>
          {board.locationName?.trim() ? `${board.locationName} · ` : null}
          {t`${board.members.length} people · ${busyCount} busy`}
        </p>
      </header>

      <div className="flex-1 px-4 py-4">
        {board.matchedTypeNames.length === 0 ? (
          <div className={cn(shopIos.inset, "px-4 py-10 text-center")}>
            <h2 className="text-[15px] font-semibold">
              <Trans>No matching employee type</Trans>
            </h2>
            <p className={cn("mt-2 text-[14px] text-pretty", shopIos.muted)}>
              {board.crew === "repair" ? (
                <Trans>
                  Create an employee type named 维修 or 机修 (or Repair /
                  Maintenance) in ERP Users → Employee types, then assign people
                  to it.
                </Trans>
              ) : (
                <Trans>
                  Create an employee type named 模房 (or Mold) in ERP Users →
                  Employee types, then assign people to it.
                </Trans>
              )}
            </p>
          </div>
        ) : board.members.length === 0 ? (
          <div className={cn(shopIos.inset, "px-4 py-10 text-center")}>
            <h2 className="text-[15px] font-semibold">
              <Trans>No people on this crew</Trans>
            </h2>
            <p className={cn("mt-2 text-[14px] text-pretty", shopIos.muted)}>
              <Trans>
                Assign active employees to one of the matched employee types.
              </Trans>{" "}
              <span className="tabular-nums">
                {board.matchedTypeNames.join(", ")}
              </span>
            </p>
          </div>
        ) : (
          <ul className={shopIos.inset}>
            {board.members.map((member, index) => (
              <MemberRow
                key={member.id}
                member={member}
                showHairline={index > 0}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
