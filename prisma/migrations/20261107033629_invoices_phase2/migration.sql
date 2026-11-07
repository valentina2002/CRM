-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "sentAt" TIMESTAMP(3),
ALTER COLUMN "paidAt" SET DATA TYPE DATE;

-- AlterTable
ALTER TABLE "IssuerSettings" ADD COLUMN     "showAmountInWords" BOOLEAN NOT NULL DEFAULT true;
