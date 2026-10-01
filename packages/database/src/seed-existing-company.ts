/**
 * Direct-DB company seed for self-host / hosted-Supabase deploys that have not
 * published the `seed-company` edge function. Mirrors the root-company path of
 * `supabase/functions/seed-company` and `datasets/bootstrap.seedCompanyReferenceData`.
 *
 * Owns NO transaction — the caller begins/commits (or the wrapper below does).
 * Skips subsidiary / identityOnly paths; those still require the edge function.
 */
import type { PoolClient } from "pg";
import { getPostgresConnectionPool } from "./client.ts";
import {
  accountDefaults,
  accounts,
  changeOrderRequiredActions,
  changeOrderTypes,
  currencies,
  customerStatuses,
  dimensions,
  failureModes,
  fiscalYearSettings,
  fixedAssetClasses,
  gaugeTypes,
  getGroupId,
  groups,
  nonConformanceRequiredActions,
  nonConformanceTypes,
  paymentTerms,
  periodCloseTaskDefinitions,
  returnReasons,
  scrapReasons,
  sequences,
  unitOfMeasures
} from "../supabase/functions/lib/seed.data.ts";

export async function seedExistingCompanyData(
  client: PoolClient,
  args: { userId: string; companyId: string }
): Promise<{ companyId: string; companyGroupId: string }> {
  const { userId, companyId } = args;

  const existing = await client.query(
    `SELECT id, name, "companyGroupId" FROM company WHERE id = $1`,
    [companyId]
  );
  if (!existing.rows[0]) {
    throw new Error(`Company ${companyId} not found`);
  }

  const link = await client.query(
    `SELECT 1 FROM "userToCompany" WHERE "userId" = $1 AND "companyId" = $2`,
    [userId, companyId]
  );
  if ((link.rowCount ?? 0) > 0) {
    return {
      companyId,
      companyGroupId: existing.rows[0].companyGroupId as string
    };
  }

  const companyName = existing.rows[0].name as string;
  let companyGroupId = existing.rows[0].companyGroupId as string | null;

  if (!companyGroupId) {
    const g = await client.query(
      `INSERT INTO "companyGroup" (name, "createdBy", "ownerId") VALUES ($1, $2, $2) RETURNING id`,
      [companyName, userId]
    );
    companyGroupId = g.rows[0].id as string;
    await client.query(
      `UPDATE company SET "companyGroupId" = $1 WHERE id = $2`,
      [companyGroupId, companyId]
    );
  }

  await client.query(
    `INSERT INTO storage.buckets (id, name, public, file_size_limit)
     VALUES ($1, $2, false, 52428800)
     ON CONFLICT (id) DO NOTHING`,
    [companyId, companyId]
  );

  await client.query(
    `INSERT INTO "userToCompany" ("userId", "companyId", "role") VALUES ($1, $2, 'employee')`,
    [userId, companyId]
  );

  for (const group of groups) {
    await client.query(
      `INSERT INTO "group" (id, name, "isCustomerTypeGroup", "isEmployeeTypeGroup", "isSupplierTypeGroup", "companyId")
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        getGroupId(group.idPrefix, companyId),
        group.name,
        group.isCustomerTypeGroup,
        group.isEmployeeTypeGroup,
        group.isSupplierTypeGroup,
        companyId
      ]
    );
  }

  const employeeTypeResult = await client.query(
    `INSERT INTO "employeeType" (name, "companyId", protected, "systemType")
     VALUES ('Admin', $1, true, 'Admin') RETURNING id`,
    [companyId]
  );
  const employeeTypeId = employeeTypeResult.rows[0].id;

  const modulesResult = await client.query(`SELECT name FROM modules`);
  const modules = modulesResult.rows as { name: string }[];

  for (const module of modules) {
    if (!module.name) continue;
    await client.query(
      `INSERT INTO "employeeTypePermission" ("employeeTypeId", module, "create", "update", "delete", view)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        employeeTypeId,
        module.name,
        [companyId],
        [companyId],
        [companyId],
        [companyId]
      ]
    );
  }

  await client.query(
    `INSERT INTO employee (id, "employeeTypeId", "companyId", active) VALUES ($1, $2, $3, true)`,
    [userId, employeeTypeId, companyId]
  );

  for (const name of customerStatuses) {
    await client.query(
      `INSERT INTO "customerStatus" (name, "companyId", "createdBy") VALUES ($1, $2, 'system')`,
      [name, companyId]
    );
  }
  for (const name of scrapReasons) {
    await client.query(
      `INSERT INTO "scrapReason" (name, "companyId", "createdBy") VALUES ($1, $2, 'system')`,
      [name, companyId]
    );
  }
  for (const name of returnReasons) {
    await client.query(
      `INSERT INTO "returnReason" (name, "inventoryValueZero", "companyId", "createdBy")
       VALUES ($1, false, $2, 'system')`,
      [name, companyId]
    );
  }
  for (const pt of paymentTerms) {
    await client.query(
      `INSERT INTO "paymentTerm" (name, "daysDue", "calculationMethod", "daysDiscount", "discountPercentage", "companyId", "createdBy")
       VALUES ($1, $2, $3, $4, $5, $6, 'system')`,
      [
        pt.name,
        pt.daysDue,
        pt.calculationMethod,
        pt.daysDiscount,
        pt.discountPercentage,
        companyId
      ]
    );
  }
  for (const uom of unitOfMeasures) {
    await client.query(
      `INSERT INTO "unitOfMeasure" (name, code, "companyId", "createdBy") VALUES ($1, $2, $3, 'system')`,
      [uom.name, uom.code, companyId]
    );
  }
  for (const d of periodCloseTaskDefinitions) {
    await client.query(
      `INSERT INTO "periodCloseTaskDefinition" (name, "taskType", "autoCheckKey", "sortOrder", required, severity, active, "isSystem", "companyId", "createdBy")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'system')`,
      [
        d.name,
        d.taskType,
        d.autoCheckKey,
        d.sortOrder,
        d.required,
        d.severity,
        d.active,
        d.isSystem,
        companyId
      ]
    );
  }
  for (const gt of gaugeTypes) {
    await client.query(
      `INSERT INTO "gaugeType" (name, "companyId", "createdBy") VALUES ($1, $2, 'system')`,
      [gt, companyId]
    );
  }
  for (const fm of failureModes) {
    await client.query(
      `INSERT INTO "maintenanceFailureMode" (name, "companyId", "createdBy") VALUES ($1, $2, 'system')`,
      [fm, companyId]
    );
  }
  for (const nct of nonConformanceTypes) {
    await client.query(
      `INSERT INTO "nonConformanceType" (name, "companyId", "createdBy") VALUES ($1, $2, 'system')`,
      [nct.name, companyId]
    );
  }
  for (const cot of changeOrderTypes) {
    await client.query(
      `INSERT INTO "changeOrderType" (name, "companyId", "createdBy") VALUES ($1, $2, 'system')`,
      [cot.name, companyId]
    );
  }
  for (const nca of nonConformanceRequiredActions) {
    await client.query(
      `INSERT INTO "nonConformanceRequiredAction" (name, "systemType", "companyId", "createdBy")
       VALUES ($1, $2, $3, 'system')`,
      [
        nca.name,
        "systemType" in nca
          ? ((nca as { systemType?: string }).systemType ?? null)
          : null,
        companyId
      ]
    );
  }
  for (const ca of changeOrderRequiredActions) {
    await client.query(
      `INSERT INTO "changeOrderRequiredAction" (name, "companyId", "createdBy") VALUES ($1, $2, 'system')`,
      [ca.name, companyId]
    );
  }
  for (const seq of sequences) {
    await client.query(
      `INSERT INTO sequence ("table", name, prefix, suffix, next, size, step, "companyId")
       VALUES ($1, $2, $3, NULL, $4, $5, $6, $7)`,
      [seq.table, seq.name, seq.prefix, seq.next, seq.size, seq.step, companyId]
    );
  }
  for (const c of currencies) {
    await client.query(
      `INSERT INTO currency (code, "decimalPlaces", "companyGroupId", "createdBy")
       VALUES ($1, $2, $3, 'system')`,
      [c.code, c.decimalPlaces, companyGroupId]
    );
  }

  const accountIdByKey: Record<string, string> = {};
  for (const { key, parentKey, ...acc } of accounts) {
    const result = await client.query(
      `INSERT INTO account (number, name, "isGroup", "accountType", "incomeBalance", class, "parentId", "isSystem", "companyGroupId", "createdBy")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'system') RETURNING id`,
      [
        acc.number,
        acc.name,
        acc.isGroup,
        acc.accountType,
        acc.incomeBalance,
        acc.class,
        parentKey ? (accountIdByKey[parentKey] ?? null) : null,
        ("isSystem" in acc
          ? (acc as { isSystem?: boolean }).isSystem
          : false) ?? false,
        companyGroupId
      ]
    );
    if (result.rows[0]?.id) accountIdByKey[key] = result.rows[0].id;
  }

  for (const d of dimensions) {
    await client.query(
      `INSERT INTO dimension (name, "entityType", "companyGroupId", "createdBy")
       VALUES ($1, $2, $3, 'system')`,
      [d.name, d.entityType, companyGroupId]
    );
  }

  const accountDefaultEntries = Object.entries(accountDefaults);
  const accountDefaultColumns = [
    ...accountDefaultEntries.map(([column]) => `"${column}"`),
    `"companyId"`
  ];
  await client.query(
    `INSERT INTO "accountDefault" (${accountDefaultColumns.join(", ")})
     VALUES (${accountDefaultColumns.map((_, i) => `$${i + 1}`).join(", ")})`,
    [
      ...accountDefaultEntries.map(
        ([, number]) => accountIdByKey[number] ?? null
      ),
      companyId
    ]
  );

  await client.query(
    `INSERT INTO "fiscalYearSettings" ("startMonth", "taxStartMonth", "companyId", "updatedBy")
     VALUES ($1, $2, $3, 'system')
     ON CONFLICT ("companyId") DO NOTHING`,
    [fiscalYearSettings.startMonth, fiscalYearSettings.taxStartMonth, companyId]
  );

  for (const fac of fixedAssetClasses) {
    await client.query(
      `INSERT INTO "fixedAssetClass" (
        "name", "depreciationMethod", "usefulLifeMonths", "residualValuePercent",
        "assetAccountId", "accumulatedDepreciationAccountId",
        "depreciationExpenseAccountId", "writeOffAccountId",
        "writeDownAccountId", "gainOnDisposalAccountId", "lossOnDisposalAccountId",
        "companyId", "createdBy"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'system')`,
      [
        fac.name,
        fac.depreciationMethod,
        fac.usefulLifeMonths,
        fac.residualValuePercent,
        accountIdByKey[fac.assetAccount],
        accountIdByKey[fac.accumulatedDepreciationAccount],
        accountIdByKey[fac.depreciationExpenseAccount],
        accountIdByKey[fac.writeOffAccount],
        accountIdByKey[fac.writeDownAccount],
        accountIdByKey[fac.gainOnDisposalAccount],
        accountIdByKey[fac.lossOnDisposalAccount],
        companyId
      ]
    );
  }

  const newPermissions: Record<string, string[]> = {};
  for (const module of modules) {
    const moduleName = module.name?.toLowerCase();
    if (!moduleName) continue;
    for (const type of ["view", "create", "update", "delete"]) {
      newPermissions[`${moduleName}_${type}`] = [companyId];
    }
  }

  const currentPermResult = await client.query(
    `SELECT permissions FROM "userPermission" WHERE id = $1`,
    [userId]
  );
  let finalPermissions = newPermissions;
  if (
    currentPermResult.rows.length > 0 &&
    currentPermResult.rows[0].permissions
  ) {
    const currentPerms = currentPermResult.rows[0].permissions as Record<
      string,
      string[]
    >;
    finalPermissions = { ...currentPerms };
    for (const [key, value] of Object.entries(newPermissions)) {
      if (key in finalPermissions) {
        if (!finalPermissions[key]!.includes(companyId)) {
          finalPermissions[key]!.push(companyId);
        }
      } else {
        finalPermissions[key] = value;
      }
    }
  }

  await client.query(
    `UPDATE "userPermission" SET permissions = $1 WHERE id = $2`,
    [JSON.stringify(finalPermissions), userId]
  );

  return { companyId, companyGroupId };
}

/**
 * Transactional wrapper used by the ERP when the `seed-company` edge function
 * is unavailable (hosted Supabase without `supabase functions deploy`).
 */
export async function seedCompanyViaDatabase(args: {
  userId: string;
  companyId: string;
}): Promise<void> {
  const pool = getPostgresConnectionPool(1);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL "app.sync_in_progress" = 'true'`);
    await seedExistingCompanyData(client, args);
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* keep original */
    }
    throw err;
  } finally {
    client.release();
  }
}
