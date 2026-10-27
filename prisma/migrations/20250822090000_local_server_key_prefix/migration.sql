-- ============================================================
-- LOCAL SERVER — KEY DISPLAY PREFIX
-- ============================================================
-- `LocalServer.deviceKey` now stores the SHA-256 digest of the issued key rather
-- than the key itself (see lib/auth/device-key.ts). The digest is unreadable, so a
-- School Admin looking at a list of provisioned halls would have no way to tell
-- which physical machine holds which credential.
--
-- `deviceKeyPrefix` carries the first few characters of the plaintext for display
-- only. Too short to narrow a 32-byte CSPRNG key by any useful amount, and never
-- accepted as authentication input.
--
-- DEFAULT '' rather than NOT NULL with no default: any LocalServer rows that predate
-- this migration have an unknown prefix, and backfilling one is impossible now that
-- only the digest is stored. Those rows display an empty prefix until their key is
-- rotated through POST /api/local-servers/[id]/rotate-key.

ALTER TABLE "LocalServer" ADD COLUMN "deviceKeyPrefix" TEXT NOT NULL DEFAULT '';
