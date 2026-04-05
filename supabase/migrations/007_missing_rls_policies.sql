-- ============================================================
-- 007: Add missing RLS policies for tables that have RLS
-- enabled but no policies (effectively blocking all access).
--
-- Tables addressed:
--   generated_documents   (firm_id)
--   document_reviews_log  (user_id — no firm_id column)
--   knowledge_base        (firm_id)
--   knowledge_embeddings  (firm_id)
--   prompt_configs        (firm_id)
--   accuracy_metrics      (firm_id)
--   learning_events       (firm_id)
-- ============================================================

-- ─── Helper: ensure RLS is enabled on generated_documents ───
ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;

-- ─── generated_documents ────────────────────────────────────
-- Service role (backend) has full access via supabase_admin client.
-- Authenticated users can read/write documents belonging to their firm.
DROP POLICY IF EXISTS generated_documents_service ON generated_documents;
CREATE POLICY generated_documents_service ON generated_documents
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS generated_documents_firm_read ON generated_documents;
CREATE POLICY generated_documents_firm_read ON generated_documents
    FOR SELECT
    TO authenticated
    USING (firm_id = get_user_firm_id(auth.uid()));

DROP POLICY IF EXISTS generated_documents_firm_write ON generated_documents;
CREATE POLICY generated_documents_firm_write ON generated_documents
    FOR INSERT
    TO authenticated
    WITH CHECK (firm_id = get_user_firm_id(auth.uid()));

DROP POLICY IF EXISTS generated_documents_firm_update ON generated_documents;
CREATE POLICY generated_documents_firm_update ON generated_documents
    FOR UPDATE
    TO authenticated
    USING (firm_id = get_user_firm_id(auth.uid()))
    WITH CHECK (firm_id = get_user_firm_id(auth.uid()));

DROP POLICY IF EXISTS generated_documents_firm_delete ON generated_documents;
CREATE POLICY generated_documents_firm_delete ON generated_documents
    FOR DELETE
    TO authenticated
    USING (firm_id = get_user_firm_id(auth.uid()));


-- ─── document_reviews_log ───────────────────────────────────
-- No firm_id column; isolate by user_id + allow admins to read all.
ALTER TABLE document_reviews_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doc_reviews_service ON document_reviews_log;
CREATE POLICY doc_reviews_service ON document_reviews_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS doc_reviews_own ON document_reviews_log;
CREATE POLICY doc_reviews_own ON document_reviews_log
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS doc_reviews_insert ON document_reviews_log;
CREATE POLICY doc_reviews_insert ON document_reviews_log
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS doc_reviews_admin_read ON document_reviews_log;
CREATE POLICY doc_reviews_admin_read ON document_reviews_log
    FOR SELECT
    TO authenticated
    USING (is_firm_admin(auth.uid()));


-- ─── knowledge_base ─────────────────────────────────────────
DROP POLICY IF EXISTS kb_service ON knowledge_base;
CREATE POLICY kb_service ON knowledge_base
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS kb_firm_read ON knowledge_base;
CREATE POLICY kb_firm_read ON knowledge_base
    FOR SELECT
    TO authenticated
    USING (firm_id = get_user_firm_id(auth.uid()));

DROP POLICY IF EXISTS kb_firm_insert ON knowledge_base;
CREATE POLICY kb_firm_insert ON knowledge_base
    FOR INSERT
    TO authenticated
    WITH CHECK (firm_id = get_user_firm_id(auth.uid()));

DROP POLICY IF EXISTS kb_firm_update ON knowledge_base;
CREATE POLICY kb_firm_update ON knowledge_base
    FOR UPDATE
    TO authenticated
    USING (firm_id = get_user_firm_id(auth.uid()))
    WITH CHECK (firm_id = get_user_firm_id(auth.uid()));

DROP POLICY IF EXISTS kb_firm_delete ON knowledge_base;
CREATE POLICY kb_firm_delete ON knowledge_base
    FOR DELETE
    TO authenticated
    USING (firm_id = get_user_firm_id(auth.uid()));


-- ─── knowledge_embeddings ───────────────────────────────────
DROP POLICY IF EXISTS kb_emb_service ON knowledge_embeddings;
CREATE POLICY kb_emb_service ON knowledge_embeddings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS kb_emb_firm_read ON knowledge_embeddings;
CREATE POLICY kb_emb_firm_read ON knowledge_embeddings
    FOR SELECT
    TO authenticated
    USING (firm_id = get_user_firm_id(auth.uid()));

DROP POLICY IF EXISTS kb_emb_firm_insert ON knowledge_embeddings;
CREATE POLICY kb_emb_firm_insert ON knowledge_embeddings
    FOR INSERT
    TO authenticated
    WITH CHECK (firm_id = get_user_firm_id(auth.uid()));

DROP POLICY IF EXISTS kb_emb_firm_delete ON knowledge_embeddings;
CREATE POLICY kb_emb_firm_delete ON knowledge_embeddings
    FOR DELETE
    TO authenticated
    USING (firm_id = get_user_firm_id(auth.uid()));


-- ─── prompt_configs ─────────────────────────────────────────
DROP POLICY IF EXISTS prompt_cfg_service ON prompt_configs;
CREATE POLICY prompt_cfg_service ON prompt_configs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS prompt_cfg_firm_read ON prompt_configs;
CREATE POLICY prompt_cfg_firm_read ON prompt_configs
    FOR SELECT
    TO authenticated
    USING (firm_id = get_user_firm_id(auth.uid()));

DROP POLICY IF EXISTS prompt_cfg_firm_write ON prompt_configs;
CREATE POLICY prompt_cfg_firm_write ON prompt_configs
    FOR INSERT
    TO authenticated
    WITH CHECK (firm_id = get_user_firm_id(auth.uid()));

DROP POLICY IF EXISTS prompt_cfg_firm_update ON prompt_configs;
CREATE POLICY prompt_cfg_firm_update ON prompt_configs
    FOR UPDATE
    TO authenticated
    USING (firm_id = get_user_firm_id(auth.uid()))
    WITH CHECK (firm_id = get_user_firm_id(auth.uid()));


-- ─── accuracy_metrics ───────────────────────────────────────
DROP POLICY IF EXISTS acc_metrics_service ON accuracy_metrics;
CREATE POLICY acc_metrics_service ON accuracy_metrics
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS acc_metrics_firm_read ON accuracy_metrics;
CREATE POLICY acc_metrics_firm_read ON accuracy_metrics
    FOR SELECT
    TO authenticated
    USING (firm_id = get_user_firm_id(auth.uid()));


-- ─── learning_events ────────────────────────────────────────
DROP POLICY IF EXISTS learning_events_service ON learning_events;
CREATE POLICY learning_events_service ON learning_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS learning_events_firm_read ON learning_events;
CREATE POLICY learning_events_firm_read ON learning_events
    FOR SELECT
    TO authenticated
    USING (firm_id = get_user_firm_id(auth.uid()));
