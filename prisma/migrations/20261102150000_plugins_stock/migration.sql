-- AlterEnum
ALTER TYPE "ActivityVerb" ADD VALUE 'STOCK_OUT';

-- AlterTable
ALTER TABLE "household" ADD COLUMN     "plugins" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "stock_board" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "imagePath" TEXT,
    "color" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "stock_board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_item" (
    "id" UUID NOT NULL,
    "boardId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "imagePath" TEXT,
    "color" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minimum" INTEGER,
    "expiresOn" DATE,
    "link" TEXT,
    "detail" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "stock_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_board_householdId_idx" ON "stock_board"("householdId");

-- CreateIndex
CREATE INDEX "stock_item_boardId_idx" ON "stock_item"("boardId");

-- AddForeignKey
ALTER TABLE "stock_board" ADD CONSTRAINT "stock_board_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_item" ADD CONSTRAINT "stock_item_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "stock_board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

