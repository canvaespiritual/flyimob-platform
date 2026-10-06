ALTER TABLE "DocumentationFolder" ADD COLUMN "correspondentMessage" TEXT;
ALTER TABLE "DocumentationFolder" ADD CONSTRAINT "documentation_correspondent_message_length"
CHECK ("correspondentMessage" IS NULL OR char_length("correspondentMessage") <= 3000);
