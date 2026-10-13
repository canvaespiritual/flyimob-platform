-- Historical rounds remain null: no inferred or fabricated views.
ALTER TABLE "DocumentationAnalysisRound" ADD COLUMN "firstViewedAt" TIMESTAMP(3);
