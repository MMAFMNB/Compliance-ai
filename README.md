# TAM Compliance AI

CMA regulatory compliance assistant — bilingual (Arabic/English) AI-powered tool for Saudi Capital Market Authority regulations.

## Architecture

- **Backend** (`backend/`) — Python FastAPI API with Anthropic Claude, Supabase, and RAG pipeline
- **Frontend** (`frontend/`) — Next.js 14 + TypeScript + Tailwind CSS

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Supabase project (for auth + database)
- Anthropic API key

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your keys
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Edit .env.local with your keys
npm run dev
```

The frontend runs on `http://localhost:3000` and connects to the backend at `http://localhost:8000`.

## Features

- **Regulatory Chat** — Ask questions about CMA regulations with citation-backed answers
- **Document Review** — Upload PDFs for clause-by-clause compliance review
- **Regulation Search** — Vector + keyword search across ingested CMA documents
- **CMA Alerts** — Auto-detect new CMA publications with AI impact summaries
- **Dashboard** — Activity stats, audit trail, and recent topics
- **Auth** — Supabase-based authentication with user profiles

## Deployment

- **Backend**: Deploy from the `backend/` directory (Railway, Render, etc.) — set root directory to `backend/`
- **Frontend**: Deploy from the `frontend/` directory (Vercel, Netlify, etc.) — set root directory to `frontend/`
