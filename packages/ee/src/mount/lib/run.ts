import type { Database } from "@carbon/database";
import type { Kysely, KyselyDatabase } from "@carbon/database/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMappingService } from "../../accounting/core/external-mapping";
import { getMountClient } from "./client";
import { MOUNT_INTEGRATION_ID } from "./constants";
import {
  MOUNT_PUBLISH_BATCH_SIZE,
  type MountPublishSettings,
  type MountPublishSummary,
  publishEntityType
} from "./publish";
import { getMountIntegration } from "./service";
import { createMountPublishSource } from "./source";
import type { MountEntityType } from "./types";

/**
 * One publish run: resolve settings, sweep, record the outcome. The
 * `mount-publish` job calls it for the integration's push actions, and a cron
 * would call it the same way.
 */
export async function runMountPublish({
  serviceRole,
  db,
  companyId,
  entityTypes,
  limit = MOUNT_PUBLISH_BATCH_SIZE
}: {
  serviceRole: SupabaseClient<Database>;
  db: Kysely<KyselyDatabase>;
  companyId: string;
  entityTypes: MountEntityType[];
  limit?: number;
}): Promise<
  { status: "inactive" } | { status: "ran"; summaries: MountPublishSummary[] }
> {
  const integration = await getMountIntegration(serviceRole, companyId);
  if (integration.error || !integration.data?.[0]?.active) {
    return { status: "inactive" };
  }

  const stored = (integration.data[0].metadata ?? {}) as {
    partDefinitionSlug?: string;
    customerTypeTitle?: string;
    supplierTypeTitle?: string;
    lastPublish?: Partial<
      Record<MountEntityType, { deferred?: string[] } | undefined>
    >;
  };

  const api = getMountClient();

  // Settings hold what a Mount user can actually see — the definition's slug
  // and the company types' titles. Resolve them to ids per run rather than
  // storing ids the user has no way to read back.
  const [definition, customerType, supplierType] = await Promise.all([
    stored.partDefinitionSlug
      ? api.findObjectDefinitionBySlug(companyId, stored.partDefinitionSlug)
      : null,
    stored.customerTypeTitle
      ? api.findCompanyTypeByTitle(companyId, stored.customerTypeTitle)
      : null,
    stored.supplierTypeTitle
      ? api.findCompanyTypeByTitle(companyId, stored.supplierTypeTitle)
      : null
  ]);

  const settings: MountPublishSettings = {
    partDefinitionId: definition?.id ?? null,
    customerTypeId: customerType?.id ?? null,
    supplierTypeId: supplierType?.id ?? null
  };

  const mappings = createMappingService(db, companyId);
  const source = createMountPublishSource(db, companyId);

  const summaries: MountPublishSummary[] = [];
  for (const entityType of entityTypes) {
    summaries.push(
      await publishEntityType(
        source,
        mappings,
        api,
        companyId,
        entityType,
        settings,
        limit,
        stored.lastPublish?.[entityType]?.deferred ?? []
      )
    );
  }

  await recordOutcome(serviceRole, companyId, summaries);

  return { status: "ran", summaries };
}

/**
 * Persist what happened, including the deferred ids the next run sorts last.
 * A record that never published has no mapping row to carry a reason, so
 * this is the only record of why it failed or was ambiguous.
 */
async function recordOutcome(
  serviceRole: SupabaseClient<Database>,
  companyId: string,
  summaries: MountPublishSummary[]
) {
  const current = await getMountIntegration(serviceRole, companyId);
  const metadata = (current.data?.[0]?.metadata ?? {}) as Record<
    string,
    unknown
  >;

  const lastPublish = {
    ...((metadata.lastPublish as Record<string, unknown>) ?? {}),
    ...Object.fromEntries(
      summaries.map((summary) => [
        summary.entityType,
        {
          at: new Date().toISOString(),
          created: summary.created,
          updated: summary.updated,
          more: summary.more,
          ambiguous: summary.ambiguous,
          failed: summary.failed,
          deferred: summary.deferred
        }
      ])
    )
  };

  await serviceRole
    .from("companyIntegration")
    .update({ metadata: { ...metadata, lastPublish } as never })
    .eq("companyId", companyId)
    .eq("id", MOUNT_INTEGRATION_ID);
}
