-- ============================================================
-- Add source column to documents table
-- Tracks which regulatory authority a document originates from
-- (e.g. 'cma.gov.sa', 'aml.gov.sa')
-- ============================================================

ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'cma.gov.sa';

-- Create index for filtering documents by source
CREATE INDEX IF NOT EXISTS idx_documents_source ON public.documents(source);
