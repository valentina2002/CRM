-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "rateCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rateWindowStart" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WebhookDelivery" ADD COLUMN     "error" TEXT,
ADD COLUMN     "eventType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "WebhookDelivery_ok_nextTryAt_idx" ON "WebhookDelivery"("ok", "nextTryAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_endpointId_createdAt_idx" ON "WebhookDelivery"("endpointId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_endpointId_eventId_key" ON "WebhookDelivery"("endpointId", "eventId");

