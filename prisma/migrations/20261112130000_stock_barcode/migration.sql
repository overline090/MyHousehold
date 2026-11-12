-- AlterTable
ALTER TABLE "stock_item" ADD COLUMN     "barcode" TEXT;

-- CreateIndex
CREATE INDEX "stock_item_barcode_idx" ON "stock_item"("barcode");

