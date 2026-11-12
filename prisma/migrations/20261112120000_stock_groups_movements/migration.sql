-- AlterTable
ALTER TABLE "stock_item" ADD COLUMN     "groupId" UUID;

-- CreateTable
CREATE TABLE "stock_group" (
    "id" UUID NOT NULL,
    "boardId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#0F766E',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "stock_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movement" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "note" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_group_boardId_idx" ON "stock_group"("boardId");

-- CreateIndex
CREATE INDEX "stock_movement_itemId_createdAt_idx" ON "stock_movement"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_item_groupId_idx" ON "stock_item"("groupId");

-- AddForeignKey
ALTER TABLE "stock_item" ADD CONSTRAINT "stock_item_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "stock_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_group" ADD CONSTRAINT "stock_group_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "stock_board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "stock_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

