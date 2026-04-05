-- ============================================================
-- match_chunks RPC: pgvector cosine similarity search
-- Required by backend/rag.py vector_search()
-- ============================================================

-- Ensure pgvector extension is available
CREATE EXTENSION IF NOT EXISTS vector;

-- Core tables for RAG pipeline (idempotent)
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    title_en TEXT,
    doc_type TEXT DEFAULT 'regulation',
    source_url TEXT,
    amendment_date TEXT,
    file_path TEXT,
    language TEXT DEFAULT 'ar',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    article_number TEXT,
    paragraph TEXT,
    part TEXT,
    chapter TEXT,
    chunk_index INT DEFAULT 0,
    embedding VECTOR(1024),  -- intfloat/multilingual-e5-large output dimension
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON public.chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_article_number ON public.chunks(article_number);

-- Conversations & messages for chat history
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);

-- ─── match_chunks RPC function ───────────────────────────────
-- Called by rag.py: supabase_admin.rpc("match_chunks", params)
-- Performs cosine similarity search on chunk embeddings.
CREATE OR REPLACE FUNCTION match_chunks(
    query_embedding VECTOR(1024),
    match_count INT DEFAULT 20,
    filter_doc_type TEXT DEFAULT NULL,
    filter_language TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    article_number TEXT,
    part TEXT,
    chapter TEXT,
    document_id UUID,
    chunk_index INT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.content,
        c.article_number,
        c.part,
        c.chapter,
        c.document_id,
        c.chunk_index,
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM public.chunks c
    LEFT JOIN public.documents d ON d.id = c.document_id
    WHERE c.embedding IS NOT NULL
      AND (filter_doc_type IS NULL OR d.doc_type = filter_doc_type)
      AND (filter_language IS NULL OR d.language = filter_language)
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- RLS policies for service_role access
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (backend uses service_role key)
DO $$ BEGIN
    CREATE POLICY service_role_documents ON public.documents FOR ALL TO service_role USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY service_role_chunks ON public.chunks FOR ALL TO service_role USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY service_role_conversations ON public.conversations FOR ALL TO service_role USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY service_role_messages ON public.messages FOR ALL TO service_role USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- IVFFlat index for faster vector search (requires data to exist)
-- Run after initial data ingestion:
-- CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON public.chunks
--     USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
