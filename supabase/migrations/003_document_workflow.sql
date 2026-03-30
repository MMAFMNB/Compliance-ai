-- ============================================================
-- Document Workflow: approval states, versioning, branding
-- ============================================================

-- Add workflow columns to generated_documents
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft';
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS review_notes TEXT;
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES generated_documents(id) ON DELETE SET NULL;
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS language VARCHAR(5) DEFAULT 'ar';
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS firm_id UUID REFERENCES firms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_generated_documents_status ON generated_documents (status);
CREATE INDEX IF NOT EXISTS idx_generated_documents_firm_id ON generated_documents (firm_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_parent_id ON generated_documents (parent_id);

-- Document review history / audit trail
CREATE TABLE IF NOT EXISTS document_reviews_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID REFERENCES generated_documents(id) ON DELETE CASCADE,
    action          VARCHAR(30) NOT NULL,  -- submit_review, approve, reject, archive
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_reviews_log_document ON document_reviews_log (document_id);
