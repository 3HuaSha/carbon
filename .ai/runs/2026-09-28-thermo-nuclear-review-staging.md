# Thermo-nuclear review: sub-assembly staging (uncommitted)

- **Scope:** working-tree diff on `feat/asembly-view-isolation` plus the new files `staging.ts`, `staging.test.ts` and `$id.steps.join.$stepId.tsx`. The `.po` catalogs and the MCP digest are excluded.
- **Verdict:** **Not approved yet.** Behaviour is right (133 viewer tests pass, browser-checked), but there are three blockers: a file pushed past 1k lines, the same rule written in three places, and staging checks scattered through the player.

## Blockers

### B1. The join rules exist in three places (SSOT)
The "which step may this step join?" rule is written three times, and each copy is phrased differently:
- the viewer: `validLinks` (`packages/viewer/src/staging.ts:~95`);
- the ERP service: `updateAssemblyStepJoin` (`production.service.ts`, five `if`s);
- the ERP UI: the `options`, `isBase` and `isJoin` filters in `StepJoinEditor` (`AssemblyInstructionProperties.tsx:~690`).

They already disagree: the viewer ignores a nested chain completely, while the UI and the service stop you creating one. The next rule change will drift them further apart.

**Code judo:** add ONE pure, three-free function to `staging.ts`, exported from `@carbon/viewer/steps`:
```ts
joinTargets(steps, stepId): { targets: string[]; lockedReason: "base" | "join" | null }
```
- The UI renders its options and locked text straight from it.
- The service calls it and rejects any `joinStepId` that is not in `targets`.
- `validLinks` becomes "keep a link only if its target is in `joinTargets(...).targets`".

That deletes five `if`s and two filters, and leaves one tested rule.

### B2. `AssemblyInstructionProperties.tsx` goes from 893 to 1056 lines
The whole ~150-line `StepJoinEditor` was added to a file that already holds four editors. The module already has a pattern for this: `AssemblyStepMaterials.tsx`, `AssemblyStepSlides.tsx` and `AssemblyStepTools.tsx` each live in their own file. Move it to `AssemblyStepJoin.tsx`. With B1 it also shrinks to the dropdown plus the "Brings in" line.

### B3. Staging checks are scattered through `AssemblyPlayer.tsx` (2646 → 2823 lines)
Staging reaches the player in eight separate places:
- the `staging` memo;
- a union branch and a `path`-shift branch inside the `displaySteps` memo;
- `segments`;
- a new `staging` prop plus `stagingLiveRef`;
- `stagingKey`, re-stringified on every render;
- park/glide in the clip effect;
- `!staging.joins.has(i)` in the fade effect;
- park/join shifts in the framing effect.

Every consumer has to know about a separate `Staging` object and look things up by index.

**Code judo:** `displaySteps` is already the "display-only adjustments" layer, so make staging part of the display step:
```ts
type DisplayStep = AssemblyStep & {
  parked: ReadonlyMap<string, Vec3>; // parts at a staging spot while this step shows
  glide: Vec3 | null;                // join step: offset to glide in from
};
```
Build it in one pure helper, `stageSteps(steps, staging): DisplayStep[]` in `staging.ts`. It does the union, the path shift, `parked` and `glide`, and is unit-tested. Then:
- the `staging` prop, `stagingLiveRef` and `stagingKey` all disappear, because the scene reads `step.parked` and `step.glide`;
- `stepTimelineSeconds` adds `GLIDE` when `step.glide` is set, so the timeline rule lives in `motion.ts` and not in the player;
- the fade check becomes `!step.glide`;
- framing reads `step.parked` and `step.glide` directly.

`parkNodes` is three.js pose code, so move it beside `buildStepClip` in `motion.ts`. The player should end up adding ~40 lines instead of 177.

## Should fix

### S1. `updateAssemblyStepJoin`: two sequential queries, a non-standard return, and no ownership check
- **Two queries:** it loads the step and then its instruction's steps. The route already has the instruction id (`params.id`), so pass it in, load the instruction's steps ONCE, and find the step in that list. That removes a round trip and also proves the step belongs to that instruction.
- **Return shape:** it returns `{ error: string | null }`, but `conventions-services.md` says services return supabase `{ data, error }`. Match the siblings, like `updateAssemblyStepHiddenComponents`.
- **Race:** the check and the write are separate calls, so two authors could race. It's low risk here, but with B1 the whole rule becomes one small function. That makes a later move into the reorder's Kysely transaction trivial if it is ever needed.

### S2. A 5th copy of the step-title rule
`titleOf` in `StepJoinEditor` re-derives `title || describeStep(toStepDescriptor(...)) || "Untitled step"`. The same rule already lives in `Properties:139`, `Explorer:432` and `AssemblyBomTree:297/390`. Extract `assemblyStepTitle(row, graphIndex, units)` once, next to `toViewerStep`, and use it in all five places. At the least, don't add the fifth copy.

### S3. `$id.tsx` maps rows to viewer steps by hand
`selectedOwnNodeIds` builds `{ id, componentNodeIds, joinStepId: step.parentStepId }` itself, while `toViewerStep` (and the `viewerSteps` memo in the same file) already does exactly that mapping. Hoist `viewerSteps` above it and pass it in. One mapper, one place that knows `parentStepId` means `joinStepId`.

### S4. `staging.ts` relies on "magic" identity
`cursors` is a `Map<Vec3, number>` keyed by array identity. That only works because `stagingAxis` returns the same element of `STAGING_AXES`. The axis index is also recovered with `k = axis[0] !== 0 ? 0 : 2`. Model the axis as `{ index: 0 | 2; sign: 1 | -1 }` and key the lanes by `${index}${sign}`. That makes the identity trick and the index recovery unnecessary.

## Nits / comments

- **N1. Too many long comments.** Several new blocks are narration: the `displaySteps` "world" paragraph, the `stagingKey` comment, "A join step glides its group in…", "Keep the staging spot inside the standing distance…". After B3 most of them go away. Keep one comment on the park/unpark pairing, because that invariant is genuinely non-obvious.
- **N2. `none` special cases.** `buildStepClip` now special-cases `none` twice (`duration = 0` and a synthetic single keyframe). That's acceptable. A small `seatedKeyframes(pose)` helper would read better than the inline object literal.
- **N3. Brittle test lookup.** The `motion.test.ts` glide test finds the glide end by float time (`< 1e-5`). Asserting the position at index `EASE_SAMPLES` is less brittle.

## Good

- The reorder cleanup runs inside the existing Kysely transaction: atomic, and one statement.
- `staging.ts` has no three.js dependency and is well tested, including chains, stale ids, lanes and the camera side.
- No migration; the feature reuses the existing `parentStepId` foreign key, `ON DELETE SET NULL` and the version-copy remap.
- MES needs only a two-line change.

## Suggested order
1. B1: `joinTargets` in `staging.ts`, used by the service, the UI and `validLinks`, with tests.
2. B2: move the editor to `AssemblyStepJoin.tsx`, using B1.
3. B3: `DisplayStep` plus `stageSteps`; delete the `staging` prop, `stagingKey` and `stagingLiveRef`; move `parkNodes` to `motion.ts`.
4. S1, S3 and S4 together; S2 as its own small change if you want it.
