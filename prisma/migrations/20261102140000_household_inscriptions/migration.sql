-- AlterTable
ALTER TABLE "household" ADD COLUMN     "inviteTtlHours" INTEGER NOT NULL DEFAULT 168,
ADD COLUMN     "registrationOpen" BOOLEAN NOT NULL DEFAULT false;

