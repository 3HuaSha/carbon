// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { Button, cn } from "@carbon/react";
import { useMemo, useState } from "react";
import { LuX } from "react-icons/lu";
import Avatar from "~/components/Avatar";
import type { ShopAssignGroup, ShopPerson } from "../shop.types";
import { shopAssignGroups } from "../shop.types";
import {
  groupPeopleByAssignGroup,
  SHOP_ASSIGN_GROUP_LABELS
} from "../shop.utils";

type GroupedAssignPickerProps = {
  people: ShopPerson[];
  busy?: boolean;
  /** When set, shows a confirm button; otherwise picking a person calls onPick immediately. */
  requireConfirm?: boolean;
  confirmLabel?: string;
  selectedId?: string | null;
  onSelectedChange?: (id: string | undefined) => void;
  onPick: (person: ShopPerson) => void;
  onCancel?: () => void;
  className?: string;
};

/**
 * Three-group assign UI: 主管 / 模房 / 维修. People are filtered by
 * `employeeType.name` aliases; empty groups still render with a short hint.
 */
export function GroupedAssignPicker({
  people,
  busy = false,
  requireConfirm = false,
  confirmLabel = "确认指派",
  selectedId: controlledSelectedId,
  onSelectedChange,
  onPick,
  onCancel,
  className
}: GroupedAssignPickerProps) {
  const [internalSelectedId, setInternalSelectedId] = useState<
    string | undefined
  >();
  const selectedId =
    controlledSelectedId !== undefined
      ? (controlledSelectedId ?? undefined)
      : internalSelectedId;

  const setSelectedId = (id: string | undefined) => {
    if (controlledSelectedId === undefined) {
      setInternalSelectedId(id);
    }
    onSelectedChange?.(id);
  };

  const groups = useMemo(() => groupPeopleByAssignGroup(people), [people]);
  const selectedPerson = people.find((p) => p.id === selectedId) ?? null;

  const onPersonClick = (person: ShopPerson) => {
    if (busy) return;
    if (requireConfirm) {
      setSelectedId(person.id);
      return;
    }
    onPick(person);
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          指派给
        </p>
        {onCancel ? (
          <button
            type="button"
            aria-label="取消"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onCancel}
          >
            <LuX className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 px-3 py-3">
        {shopAssignGroups.map((group) => (
          <AssignGroupSection
            key={group}
            group={group}
            people={groups[group]}
            selectedId={selectedId}
            busy={busy}
            onPick={onPersonClick}
          />
        ))}
      </div>

      {requireConfirm ? (
        <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
          {selectedPerson ? (
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              已选：
              <span className="font-medium text-foreground">
                {selectedPerson.name}
              </span>
            </p>
          ) : (
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">
              请选择一位人员
            </p>
          )}
          <Button
            type="button"
            size="sm"
            variant="primary"
            isDisabled={busy || !selectedPerson}
            onClick={() => {
              if (selectedPerson) onPick(selectedPerson);
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AssignGroupSection({
  group,
  people,
  selectedId,
  busy,
  onPick
}: {
  group: ShopAssignGroup;
  people: ShopPerson[];
  selectedId: string | undefined;
  busy: boolean;
  onPick: (person: ShopPerson) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-foreground">
        {SHOP_ASSIGN_GROUP_LABELS[group]}
        <span className="ml-1.5 text-xs font-normal tabular-nums text-muted-foreground">
          {people.length}
        </span>
      </p>
      {people.length === 0 ? (
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          暂无该类型人员
        </p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border">
          {people.map((person) => {
            const selected = person.id === selectedId;
            return (
              <li
                key={person.id}
                className="border-b border-border last:border-b-0"
              >
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onPick(person)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60 disabled:opacity-50",
                    selected && "bg-primary/10 hover:bg-primary/15"
                  )}
                >
                  <Avatar
                    name={person.name}
                    path={person.avatarUrl}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {person.name}
                  </span>
                  {selected ? (
                    <span className="shrink-0 text-xs font-medium text-primary">
                      已选
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
