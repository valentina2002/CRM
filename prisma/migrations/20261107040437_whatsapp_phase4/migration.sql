-- AlterTable
ALTER TABLE "ChannelAccount" ADD COLUMN     "sync" JSONB;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "meta" JSONB;
