-- ============================================================
-- Document Reviews: store AI compliance review results
-- This table was missing — backend review.py and dashboard.py
-- reference it, but no migration ever created it.
-- ============================================================

CREATE TABLE IF NOT EXISTS document_reviews (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    filename        VARCHAR(500) NOT NULL,
    language        VARCHAR(10) DEFAULT 'ar',
    total_findings  INT DEFAULT 0,
    compliant       INT DEFAULT 0,
    non_compliant   INT DEFAULT 0,
    needs_review    INT DEFAULT 0,
    findings        JSONB DEFAULT '[]',
    latency_ms      INT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_reviews_user_id ON document_reviews (user_id);
CREATE INDEX IF NOT EXISTS idx_document_reviews_created_at ON document_reviews (created_at DESC);

-- RLS: users can read their own reviews; service role handles inserts
ALTER TABLE document_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_reviews_select_own ON document_reviews
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY document_reviews_insert_own ON document_reviews
    FOR INSERT
    WITH CHECK (user_id = auth.uid());
