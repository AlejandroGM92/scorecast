-- CreateEnum
CREATE TYPE "Competition" AS ENUM ('WORLD_CUP', 'COL_LIGA');

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "competition" "Competition" NOT NULL DEFAULT 'WORLD_CUP';
