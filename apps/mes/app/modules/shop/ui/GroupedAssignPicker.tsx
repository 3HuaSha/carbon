// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { Button, cn } from "@carbon/react";
import { useEffect, useMemo, useState } from "react";
import { LuCheck, LuX } from "react-icons/lu";
import Avatar from "~/components/Avatar";
import type { ShopAssignGroup, ShopPerson } from "../shop.types";
import { shopAssignGroups } from "../shop.types";
import {
  defaultSelectedAssignIds,
  groupPeopleByAssignGroup,
  resolvePrimaryAssigneeId,
  SHOP_ASSIGN_GROUP_LABELS
} from "../shop.utils";
import { shopIos } from "./shopIos";

export type AssignSelection = {
  /** Carbon `maintenanceDispatch.assignee` (single userId). */
  assigneeId: string;
  /** All selected people — primary + Telegram notify targets. */
  notifyUserIds: string[];
};

type GroupedAssignPickerProps = {
  people: ShopPerson[];
  busy?: boolean;
  /**
   * When true, shows 确认指派 and calls onSubmit only on confirm.
   * When false (report form), selection is optional and syncs via onSelectionChange.
   */
  requireConfirm?: boolean;
  confirmLabel?: string;
  onSubmit?: (selection: AssignSelection) => void;
  onSelectionChange?: (selection: AssignSelection | null) => void;
  onCancel?: () => void;
  className?: string;
};

/**
 * Four-column multi-select assign UI: 主管 / PE / 模房 / 维修.
 * Opaque inset card — selection via background swap only (no blur/motion libs).
 */
export function GroupedAssignPicker({
  people,
  busy = false,
  requireConfirm = false,
  confirmLabel = "确认指派",
  onSubmit,
  onSelectionChange,
  onCancel,
  className
}: GroupedAssignPickerProps) {
  const groups = useMemo(() => groupPeopleByAssignGroup(people), [people]);
  const defaultSelectedKey = useMemo(
    () => defaultSelectedAssignIds(people).join(","),
    [people]
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    defaultSelectedAssignIds(people)
  );

  useEffect(() => {
    setSelectedIds(defaultSelectedKey ? defaultSelectedKey.split(",") : []);
  }, [defaultSelectedKey]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selection = useMemo((): AssignSelection | null => {
    if (selectedIds.length === 0) return null;
    const assigneeId = resolvePrimaryAssigneeId(selectedIds, people);
    if (!assigneeId) return null;
    return { assigneeId, notifyUserIds: selectedIds };
  }, [people, selectedIds]);

  useEffect(() => {
    onSelectionChange?.(selection);
  }, [onSelectionChange, selection]);

  const togglePerson = (personId: string) => {
    if (busy) return;
    setSelectedIds((prev) =>
      prev.includes(personId)
        ? prev.filter((id) => id !== personId)
        : [...prev, personId]
    );
  };

  const selectedCount = selectedIds.length;
  const primaryName =
    people.find((p) => p.id === selection?.assigneeId)?.name ?? null;

  return (
    <div className={cn(shopIos.inset, className)}>
      <div className="flex items-center justify-between gap-2 border-b border-[color:var(--shop-hairline)] px-3 py-2">
        <p className={shopIos.sectionLabel}>指派给</p>
        {onCancel ? (
          <button
            type="button"
            aria-label="取消"
            className={cn(
              "rounded-full p-1.5",
              shopIos.muted,
              "active:opacity-60"
            )}
            onClick={onCancel}
          >
            <LuX className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div
        className="grid grid-cols-4"
        style={{ gap: 1, background: "var(--shop-hairline)" }}
      >
        {shopAssignGroups.map((group) => (
          <AssignColumn
            key={group}
            group={group}
            people={groups[group]}
            selectedIds={selectedSet}
            busy={busy}
            onToggle={togglePerson}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5">
        {selectedCount > 0 ? (
          <p
            className={cn("min-w-0 flex-1 truncate text-[12px]", shopIos.muted)}
          >
            已选 {selectedCount} 人
            {primaryName ? (
              <>
                · 负责人{" "}
                <span className="font-medium text-[color:var(--shop-ink)]">
                  {primaryName}
                </span>
              </>
            ) : null}
          </p>
        ) : (
          <p className={cn("min-w-0 flex-1 text-[12px]", shopIos.muted)}>
            {requireConfirm ? "请选择至少一位人员" : "可不选；默认已选全部主管"}
          </p>
        )}
        {requireConfirm ? (
          <Button
            type="button"
            size="sm"
            variant="primary"
            isDisabled={busy || !selection}
            onClick={() => {
              if (selection) onSubmit?.(selection);
            }}
          >
            {confirmLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function AssignColumn({
  group,
  people,
  selectedIds,
  busy,
  onToggle
}: {
  group: ShopAssignGroup;
  people: ShopPerson[];
  selectedIds: Set<string>;
  busy: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex min-h-[8rem] flex-col bg-[color:var(--shop-card)]">
      <p
        className="px-1.5 py-1.5 text-center text-[12px] font-semibold"
        style={{ borderBottom: "1px solid var(--shop-hairline)" }}
      >
        {SHOP_ASSIGN_GROUP_LABELS[group]}
        <span className={cn("ml-0.5 tabular-nums", shopIos.muted)}>
          {people.length}
        </span>
      </p>
      {people.length === 0 ? (
        <p
          className={cn(
            "px-1.5 py-2 text-center text-[10px] leading-snug",
            shopIos.muted
          )}
        >
          暂无
        </p>
      ) : (
        <ul className="flex flex-1 flex-col">
          {people.map((person) => {
            const selected = selectedIds.has(person.id);
            return (
              <li key={person.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onToggle(person.id)}
                  aria-pressed={selected}
                  className={cn(
                    "flex w-full flex-col items-center gap-1 px-1 py-2 text-center disabled:opacity-50",
                    "transition-colors duration-100 ease-out",
                    selected
                      ? "bg-[color:var(--shop-link)]/10"
                      : "active:bg-[color:var(--shop-track)]"
                  )}
                >
                  <span className="relative">
                    <Avatar
                      name={person.name}
                      path={person.avatarUrl}
                      size="sm"
                    />
                    {selected ? (
                      <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[color:var(--shop-link)] text-white">
                        <LuCheck className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                    ) : null}
                  </span>
                  <span className="line-clamp-2 w-full break-words text-[11px] font-medium leading-tight">
                    {person.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
