-- AlterTable: add lastEditedAt to Prediction
-- Nullable so existing predictions default to NULL (never edited after creation)
ALTER TABLE "Prediction" ADD COLUMN "lastEditedAt" TIMESTAMP(3);
