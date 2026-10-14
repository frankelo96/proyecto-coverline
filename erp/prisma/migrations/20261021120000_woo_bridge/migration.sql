-- CreateTable
CREATE TABLE "woo_bridge" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "token" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "pluginVersion" TEXT,
    "siteUrl" TEXT,
    "catalogRequested" BOOLEAN NOT NULL DEFAULT true,
    "lastCatalogAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "woo_bridge_pkey" PRIMARY KEY ("id")
);

