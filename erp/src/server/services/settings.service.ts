import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { type InstallmentPlan, parsePlans } from "@/lib/pos/installments";
import { db } from "@/server/db";

const PLANS_KEY = "pos.installmentPlans";

export async function getInstallmentPlans(client: Pick<Prisma.TransactionClient, "appSetting"> = db): Promise<InstallmentPlan[]> {
  const row = await client.appSetting.findUnique({ where: { key: PLANS_KEY } });
  return parsePlans(row?.value);
}

export async function saveInstallmentPlans(plans: InstallmentPlan[]) {
  const value = parsePlans(plans) as unknown as Prisma.InputJsonValue;
  await db.appSetting.upsert({ where: { key: PLANS_KEY }, update: { value }, create: { key: PLANS_KEY, value } });
}

const WEB_PRICES_KEY = "woo.syncPrices";

/** Si el ERP actualiza el precio regular de la tienda web (precio de lista con IVA y ajuste de talle). */
export async function getWebPriceSync(client: Pick<Prisma.TransactionClient, "appSetting"> = db): Promise<boolean> {
  const row = await client.appSetting.findUnique({ where: { key: WEB_PRICES_KEY } });
  return row?.value === true;
}

export async function setWebPriceSync(enabled: boolean) {
  await db.appSetting.upsert({ where: { key: WEB_PRICES_KEY }, update: { value: enabled }, create: { key: WEB_PRICES_KEY, value: enabled } });
}
