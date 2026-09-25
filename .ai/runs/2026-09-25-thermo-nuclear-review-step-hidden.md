# Thermo-nuclear review: per-step hidden components

**Scope:** uncommitted changes on `feat/asembly-view-isolation` (hidden lists per step,
Isolate view removed, "This step" badge, undoable "Show all").
**Verdict:** not approved yet. The behaviour is right. The structure scatters one
invariant across seven places, leaves a dead API behind, and duplicates a list
component. There is also one real interaction bug.

## 1. One invariant, seven enforcement sites (structural, blocker)

The rule "a step never hides its own parts" is implemented separately in:

1. `updateAssemblyStepHiddenComponents` (service): read the step, then strip.
2. `updateAssemblyStepComponents` (service): read the hidden list, then strip on write.
3. `reassignAssemblyStepComponents` (service): strip per written step, with a cast.
4. `onSetHiddenComponents` in `$id.tsx`: strip on the client.
5. `onSelectComponents` add-mode in `$id.tsx`: patch the hidden draft by hand.
6. `onToggleHide` / `onHideSelection` in `AssemblyBomTree`: filter "eligible".
7. `stepHiddenNodeIds` in the viewer: strip on read.

The same comment is restated in three of them, which is the tell.

**The code-judo move is to put the invariant in the database, once.** Add a
`BEFORE INSERT OR UPDATE` trigger on `assemblyInstructionStep` that sets
`"hiddenComponentNodeIds"` to its own elements minus `"componentNodeIds"`. It can
use `array(select unnest(new.hidden) except select unnest(new.components))`, or
`array_remove` in a loop. Then:

- `updateAssemblyStepComponents` and `reassignAssemblyStepComponents` go back to
  their original single writes. That deletes the extra `select`, the
  `as string[]` cast, and the added comments.
- `updateAssemblyStepHiddenComponents` becomes one `update` with no read first.
- The read-then-write race in site 2 goes away. Two concurrent saves can no
  longer resurrect a stripped id, because today's read and write are two round
  trips and not atomic.
- Every other writer is covered for free: version copy, BOP sync, regenerate,
  and future code.

On the client, keep exactly one strip, in `onSetHiddenComponents`, for the
optimistic draft. Delete site 5, since the hide draft only matters until the
next revalidate and the viewer already ignores own parts. Reduce site 6 to "no
eligible parts means a disabled eye", which it already gets from
`hideAvailability`. Keep site 7, the viewer, as the render-time guard.

## 2. Dead API left behind in the viewer (boundary)

`AssemblyPlayer`'s `hiddenNodeIds` prop has **no callers** now. The ERP stopped
passing it, and MES never did (grep shows only the internal pass-through at
`AssemblyPlayer.tsx:511`). `stepHiddenNodeIds(alwaysHidden, step)` takes its first
argument only to serve that dead prop. Delete the prop and its doc comment, make
the helper `stepHiddenNodeIds(step)`, and drop the test cases about merging with
an always-hidden set. That's one fewer concept in the public contract.

## 3. Real bug: clicking a "Hidden on this step" row blanks the viewer

`AssemblyInstructionProperties` gets `onSelectComponents={onFocusComponents}`
(`$id.tsx`), and the new hidden list calls it on row click. So clicking a hidden
part **isolates it**, meaning only focused parts render, while the hide pass
hides that same part. The view goes empty until the next 3D click clears the
isolate, which then "adds everything back". This is very likely what was
reported as "clicking the 3D view adds things back". Rows in the hidden list
should select without isolating, or not be clickable at all.

## 4. Prop explosion across four row types (spaghetti)

Each of `UnitListRow`, `UnitChildRow`, `ComponentRow` and `InstanceRow` gained
`isHideDisabled`, `hideDisabledReason` and `isOnStep`, on top of the existing
`hidden` and `onToggleHide`. That's five hide-related props threaded four times,
spread via `{...hideAvailability(nodes)}` plus a separate `isOnStep={...}` at each
call site.

**Remedy:** one typed model per row, built by one function:

```ts
type RowHide = {
  state: SelectionState;        // none | partial | all hidden
  isOnStep: boolean;
  disabledReason?: string;      // present ⇒ disabled with tooltip
  isDisabled: boolean;
  onToggle: () => void;
};
```

Each row then takes `hide: RowHide` and renders
`{hide.isOnStep && <ThisStepBadge/>}<HideToggle hide={hide}/>`. That removes 4×5
props, the spread, and `HideToggle`'s vague `isMarked` flag, which becomes
`hide.state !== "none"`.

Similarly, the page and explorer thread `hasSelectedStep` + `ownNodeIds` +
`hiddenNodeIds` + `onSetHiddenComponents`. Model that as one nullable
`stepHiding: { ownNodeIds; hiddenNodeIds; onChange } | null`, where null means no
step is selected. The one-off boolean disappears, and "no step" becomes
impossible to combine with stale arrays.

## 5. File size and duplication (decomposition)

- `AssemblyBomTree.tsx` grew from 1,841 to 1,960 lines. It was already over
  1,000, and this adds to it. Move `HideToggle`, `ThisStepBadge` and the
  `RowHide` builder into `AssemblyBomTreeHide.tsx`.
- `AssemblyInstructionProperties.tsx` grew from 732 to 935 lines, close to 1,000.
  `StepHiddenComponentsEditor` repeats `StepComponentsEditor`'s grouped-list
  markup almost line for line: swatch, name, ×count, selected state, keyboard
  handler, hover action. Extract one `StepComponentList` that takes
  `(nodeIds, graphIndex, selectedNodeIds, onRowClick, renderAction)`. Put both
  editors, plus `HideAgainButton`, in `AssemblyStepComponentEditors.tsx`.
  Together that takes about 250 lines out of the file.

## 6. Smaller points

- **The undo window lives in component state.** `StepForm` is keyed by step id,
  so switching steps mid-countdown silently commits the "show all". Acceptable,
  but say so in the component's comment rather than leave it implicit.
- **`HideAgainButton` uses a `requestAnimationFrame` flip to trigger a CSS
  transition.** A `@keyframes` rule, or Tailwind `animate-[…]` on a static
  element, needs no effect and no state.
- **Comments restate the code.** Examples are "Autosave the active step's hidden
  list", "Push …", and the three copies of the invariant comment. After item 1
  most of them go. Keep the ones that explain *why*, such as the viewer's
  own-parts guard and the undo window.
- **The new route doesn't check the instruction is a Draft.** Neither does the
  components route, so it matches precedent. It's worth one line in both,
  because the UI gate is the only gate today.

## Suggested order

1. Fix the hidden-row isolate bug (3), which is small and user-visible.
2. Add the DB trigger and delete the service-side strips (1).
3. Delete the dead `hiddenNodeIds` prop (2).
4. Introduce the `RowHide` and `stepHiding` models (4), then split the files (5).
