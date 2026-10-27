-- ============================================================
-- PHASE 1 + 2: SECURITY BOOKKEEPING AND SELF-SERVICE PAIRING
-- ============================================================

-- A hall can exist before it is paired. The device key is minted only when a
-- short-lived setup code is claimed, so a lost installer never leaves a usable
-- long-lived credential lying around.
ALTER TABLE "LocalServer" ALTER COLUMN "deviceKey" DROP NOT NULL;
ALTER TABLE "LocalServer" ADD COLUMN "setupCodeHash" TEXT;
ALTER TABLE "LocalServer" ADD COLUMN "setupCodeExpiresAt" TIMESTAMP(3);
ALTER TABLE "LocalServer" ADD COLUMN "setupCodeUsedAt" TIMESTAMP(3);
ALTER TABLE "LocalServer" ADD COLUMN "pairedAt" TIMESTAMP(3);
ALTER TABLE "LocalServer" ADD COLUMN "appVersion" TEXT;

CREATE UNIQUE INDEX "LocalServer_setupCodeHash_key" ON "LocalServer"("setupCodeHash");

-- Failure counters used by login, student login and device pairing. Deliberately
-- keyed by (scope, key) rather than IP only: account-targeted attacks must be
-- slowed even when the attacker rotates source addresses.
CREATE TABLE "AuthThrottle" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthThrottle_scope_key_key" ON "AuthThrottle"("scope", "key");
CREATE INDEX "AuthThrottle_resetAt_idx" ON "AuthThrottle"("resetAt");

-- Minimal audit trail for credentials and provisioning. Intentionally not
-- relationally coupled to School/User so deleting a tenant never erases the
-- record that something happened.
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "actorUserId" TEXT,
    "actorType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "ip" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_schoolId_createdAt_idx" ON "AuditLog"("schoolId", "createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
