// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { cn, Status } from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import Avatar from "~/components/Avatar";
import { useDateFormatter } from "~/hooks/useDateFormatter";
import { path } from "~/utils/path";
import type {
  ShopCrewBoard,
  ShopCrewKind,
  ShopCrewMember,
  ShopCrewTask,
  ShopDispatchKind
} from "../shop.types";
import { ShopTabNav } from "./ShopTabNav";
import { shopIos } from "./shopIos";

type ShopCrewPageProps = {
  board: ShopCrewBoard;
};

const CREW_TITLE: Record<ShopCrewKind, () => ReactNode> = {
  repair: () => <Trans>Repair</Trans>,
  mold: () => <Trans>Mold shop</Trans>
};

function KindLabel({ kind }: { kind: ShopDispatchKind }) {
  switch (kind) {
    case "fault":
      return <Trans>Fault</Trans>;
    case "planned":
      return <Trans>Planned</Trans>;
    case "break":
      return <Trans>Break</Trans>;
  }
}

function StatusLabel({ status }: { status: string | null }) {
  switch (status) {
    case "In Progress":
      return (
        <Status color="red" disableTooltip>
          <Trans>In Progress</Trans>
        </Status>
      );
    case "Assigned":
      return (
        <Status color="orange" disableTooltip>
          <Trans>Assigned</Trans>
        </Status>
      );
    case "Open":
      return (
        <Status color="yellow" disableTooltip>
          <Trans>Open</Trans>
        </Status>
      );
    default:
      return status ? (
        <Status color="gray" disableTooltip>
          {status}
        </Status>
      ) : null;
  }
}

function TaskRow({ task }: { task: ShopCrewTask }) {
  const navigate = useNavigate();
  const { formatTimeAgo } = useDateFormatter();
  const machineName = task.workCenterName?.trim() || "—";
  const note = task.note?.trim() || null;

  return (
    <button
      type="button"
      onClick={() => {
        if (task.workCenterId) {
          navigate(path.to.shopMachine(task.workCenterId));
        }
      }}
      disabled={!task.workCenterId}
      className={cn(
        "flex w-full flex-col gap-1 px-3 py-2.5 text-left",
        "border-t border-[color:var(--shop-hairline)]",
        task.workCenterId && shopIos.press
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold">
            {machineName}
          </div>
          <div
            className={cn(
              "mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]",
              shopIos.muted
            )}
          >
            <span>
              <KindLabel kind={task.shopKind} />
            </span>
            {task.createdAt ? (
              <span className="tabular-nums">
                {formatTimeAgo(task.createdAt)}
              </span>
            ) : null}
          </div>
        </div>
        <StatusLabel status={task.status} />
      </div>
      {note ? (
        <p
          className={cn("line-clamp-2 text-[13px] text-pretty", shopIos.muted)}
        >
          {note}
        </p>
      ) : null}
    </button>
  );
}

function MemberCard({ member }: { member: ShopCrewMember }) {
  const idle = member.tasks.length === 0;

  return (
    <section className={shopIos.inset}>
      <div className="flex items-center gap-3 px-3 py-3">
        <Avatar name={member.name} path={member.avatarUrl} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-semibold">
            {member.name}
          </div>
          <div className={cn("text-[13px]", shopIos.muted)}>
            {idle ? (
              <Trans>Idle</Trans>
            ) : (
              <Trans>{member.tasks.length} open tasks</Trans>
            )}
            {member.employeeTypeName ? (
              <span>
                {" · "}
                {member.employeeTypeName}
              </span>
            ) : null}
          </div>
        </div>
        {idle ? (
          <span
            className={cn(
              "shrink-0 rounded-md bg-[color:var(--shop-track)] px-2 py-1 text-[12px]",
              shopIos.muted
            )}
          >
            <Trans>Idle</Trans>
          </span>
        ) : (
          <span className="shrink-0 rounded-md bg-[color:var(--shop-warn)]/15 px-2 py-1 text-[12px] font-semibold tabular-nums text-[color:var(--shop-warn)]">
            {member.tasks.length}
          </span>
        )}
      </div>

      {member.tasks.length > 0
        ? member.tasks.map((task) => <TaskRow key={task.id} task={task} />)
        : null}
    </section>
  );
}

export function ShopCrewPage({ board }: ShopCrewPageProps) {
  const { t } = useLingui();
  const busyCount = board.members.filter((m) => m.tasks.length > 0).length;
  const tab = board.crew === "repair" ? "repair" : "mold";

  return (
    <div
      className={cn(
        "mx-auto flex min-h-dvh w-full max-w-3xl flex-col",
        shopIos.pageEnter
      )}
    >
      <header
        className={cn(
          "sticky top-0 z-10 px-4 pt-5 pb-3 space-y-3",
          shopIos.bar
        )}
      >
        <div className="min-w-0">
          <h1 className={shopIos.largeTitle}>{CREW_TITLE[board.crew]()}</h1>
          <p className={cn("mt-0.5 text-[15px] tabular-nums", shopIos.muted)}>
            {board.locationName?.trim() ? `${board.locationName} · ` : null}
            {t`${board.members.length} people · ${busyCount} busy`}
          </p>
        </div>
        <ShopTabNav active={tab} />
      </header>

      <div className="flex-1 space-y-3 px-4 py-4">
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
          board.members.map((member) => (
            <MemberCard key={member.id} member={member} />
          ))
        )}
      </div>
    </div>
  );
}
