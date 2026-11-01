-- Enum values are committed by the preceding migration before this constraint uses them.
BEGIN;
ALTER TABLE "Announcement" DROP CONSTRAINT "Announcement_audience_check";
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_audience_check" CHECK (
  ("audience" IN ('ALL_STAFF', 'ALL_PARENTS') AND "targetRole" IS NULL AND "classArmId" IS NULL) OR
  ("audience" = 'ROLE' AND "targetRole" IS NOT NULL AND "classArmId" IS NULL) OR
  ("audience" IN ('CLASS_ARM', 'PARENT_CLASS_ARM') AND "targetRole" IS NULL AND "classArmId" IS NOT NULL)
);
COMMIT;
