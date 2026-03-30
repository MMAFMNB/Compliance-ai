-- ============================================================
-- Feedback System: capture user ratings on AI outputs
-- ============================================================

CREATE TABLE IF NOT EXISTS feedback (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    firm_id         UUID REFERENCES firms(id) ON DELETE SET NULL,
    feature         VARCHAR(50) NOT NULL,  -- chat, review, docgen, impact_analysis, checklist, assessment
    resource_id     TEXT,                  -- conversation_id, document_id, etc.
    rating          VARCHAR(20) NOT NULL,  -- approved, needs_edit, rejected
    original_output TEXT,
    edited_output   TEXT,
    comments        TEXT,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_firm_id ON feedback (firm_id);
CREATE INDEX IF NOT EXISTS idx_feedback_feature ON feedback (feature);
CREATE INDEX IF NOT EXISTS idx_feedback_rating ON feedback (rating);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback (created_at DESC);

-- RLS
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY feedback_own ON feedback
    FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY feedback_admin ON feedback
    FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin', 'firm_admin'))
    );
