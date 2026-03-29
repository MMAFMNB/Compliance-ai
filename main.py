import logging
import traceback

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import FRONTEND_URL

logging.basicConfig(level=logging.INFO)
from chat import router as chat_router
from conversations import router as conversations_router
from auth_routes import router as auth_router
from search import router as search_router
from review import router as review_router
from alerts import router as alerts_router
from dashboard import router as dashboard_router

app = FastAPI(
    title="TAM Compliance AI",
    description="CMA Regulatory Compliance Assistant API",
    version="3.0.0",
)

ALLOWED_ORIGINS = [
    FRONTEND_URL,
    "https://tam-compliance-ai-frontend.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _cors_headers(request: Request) -> dict:
    """Return CORS headers matching the request origin."""
    origin = request.headers.get("origin", "")
    import re
    if origin in ALLOWED_ORIGINS or re.match(r"https://.*\.vercel\.app$", origin):
        return {
            "access-control-allow-origin": origin,
            "access-control-allow-credentials": "true",
        }
    return {}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch all unhandled exceptions so CORS headers are still returned."""
    logging.error("Unhandled error on %s %s: %s", request.method, request.url.path, exc)
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {exc}"},
        headers=_cors_headers(request),
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Ensure HTTPException responses also include CORS headers."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=_cors_headers(request),
    )


app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(conversations_router)
app.include_router(search_router)
app.include_router(review_router)
app.include_router(alerts_router)
app.include_router(dashboard_router)


@app.get("/")
def health():
    return {"status": "ok", "service": "TAM Compliance AI", "version": "3.0.0"}




if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
