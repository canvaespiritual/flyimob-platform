-- Existing waiting/reanalysis states are reused; only active analysis was missing.
ALTER TYPE "DocumentationFolderStatus" ADD VALUE IF NOT EXISTS 'EM_ANALISE';
