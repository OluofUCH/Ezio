-- FUTURE MIGRATION PREVIEW — DO NOT APPLY OR MOVE INTO prisma/migrations YET.
-- Promote this into a new, later Prisma migration only after every live school has
-- run `pnpm sms:backfill-results --school <id> --apply` and the guard succeeds.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "AssessmentComponent" WHERE "isActive" IS NULL) THEN
    RAISE EXCEPTION 'AssessmentComponent.isActive still has null rows; run and verify the per-school backfill first.';
  END IF;
END $$;

ALTER TABLE "AssessmentComponent" ALTER COLUMN "isActive" SET DEFAULT true;
ALTER TABLE "AssessmentComponent" ALTER COLUMN "isActive" SET NOT NULL;
