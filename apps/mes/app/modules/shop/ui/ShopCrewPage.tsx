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
        "flex w-full flex-col gap-1 rounded-md border border-border/70 bg-background px-3 py-2.5 text-left",
        task.workCenterId && "active:scale-[0.99] transition-transform"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{machineName}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
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
        <p className="line-clamp-2 text-xs text-muted-foreground text-pretty">
          {note}
        </p>
      ) : null}
    </button>
  );
}

function MemberCard({ member }: { member: ShopCrewMember }) {
  const idle = member.tasks.length === 0;

  return (
    <section className="rounded-lg border border-border/60 bg-card/40 px-3 py-3">
      <div className="flex items-center gap-3">
        <Avatar name={member.name} path={member.avatarUrl} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{member.name}</div>
          <div className="text-xs text-muted-foreground">
            {idle ? (
              <Trans>Idle</Trans>
            ) : (
              <Trans>{member.tasks.length} open tasks</Trans>
            )}
            {member.employeeTypeName ? (
              <span className="text-muted-foreground/80">
                {" · "}
                {member.employeeTypeName}
              </span>
            ) : null}
          </div>
        </div>
        {idle ? (
          <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            <Trans>Idle</Trans>
          </span>
        ) : (
          <span className="shrink-0 rounded-md bg-orange-100 px-2 py-1 text-xs font-medium text-orange-800 dark:bg-orange-950/50 dark:text-orange-200 tabular-nums">
            {member.tasks.length}
          </span>
        )}
      </div>

      {member.tasks.length > 0 ? (
        <div className="mt-3 space-y-2">
          {member.tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ShopCrewPage({ board }: ShopCrewPageProps) {
  const { t } = useLingui();
  const busyCount = board.members.filter((m) => m.tasks.length > 0).length;
  const tab = board.crew === "repair" ? "repair" : "mold";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 pt-3 pb-3 space-y-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {CREW_TITLE[board.crew]()}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
            {board.locationName?.trim() ? `${board.locationName} · ` : null}
            {t`${board.members.length} people · ${busyCount} busy`}
          </p>
        </div>
        <ShopTabNav active={tab} />
      </header>

      <div className="flex-1 space-y-3 px-4 py-4">
        {board.matchedTypeNames.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
            <h2 className="text-sm font-semibold">
              <Trans>No matching employee type</Trans>
            </h2>
            <p className="mt-2 text-sm text-muted-foreground text-pretty">
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
          <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
            <h2 className="text-sm font-semibold">
              <Trans>No people on this crew</Trans>
            </h2>
            <p className="mt-2 text-sm text-muted-foreground text-pretty">
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
