"""
BloodBridge AI — FastAPI Backend Main Entry Point
Run: uvicorn main:app --reload --port 8000
"""
import logging
import sys
import os

# Add backend dir to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from config.settings import settings
from database.db import init_db
from database.seed_data import seed_all
from routers.patients import router as patients_router
from routers.donors import router as donors_router
from routers.auth import router as auth_router
from routers.chatbot import router as chatbot_router
from routers import (
    matches_router, forecasts_router, outreach_router,
    analytics_router, awareness_router
)
from routers.settings_router import router as settings_router
from websocket.live_events import websocket_handler

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)


# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("BloodBridge AI Backend Starting...")
    logger.info("   Database: SQLite @ %s", settings.db_path)
    logger.info("   AI Mode: %s", "Bedrock" if settings.use_bedrock else "Local")

    # Initialize DB
    if settings.use_dynamodb:
        from database.dynamo_db import init_dynamodb
        init_dynamodb()
    else:
        init_db()

    # Seed data if empty (SQLite only for now, migration script handles Dynamo)
    if not settings.use_dynamodb:
        seed_all()

    # Try loading ML model
    try:
        from ml.predict import load_model
        if load_model():
            logger.info("[OK] XGBoost model loaded")
        else:
            logger.warning("[WARN] No ML model found. Using heuristic predictor. Run: python -m ml.train_model")
    except Exception as e:
        logger.warning("[WARN] ML model load failed: %s", e)

    # Start Background Automation Scheduler (runs outreach automation every hour)
    import threading
    import time
    def scheduler_loop():
        logger.info("[CLOCK] Background Automation Scheduler Thread Started (1-hour interval)")
        from services.automation_service import run_outreach_automation
        # Sleep for 1 minute initially to let the server start up completely
        time.sleep(60)
        while True:
            try:
                logger.info("[CLOCK] Running scheduled outreach automation...")
                run_outreach_automation()
            except Exception as e:
                logger.error("Error in scheduled automation loop: %s", e)
            # Sleep for 1 hour
            time.sleep(3600)

    # Prevent development server restarts from draining Twilio SMS limits
    if not settings.debug:
        scheduler_thread = threading.Thread(target=scheduler_loop, daemon=True)
        scheduler_thread.start()
    else:
        logger.info("[PAUSED] DEBUG mode active: Background Automation Scheduler is DISABLED to save Twilio limits.")

    logger.info("[OK] BloodBridge AI Backend ready at http://localhost:8000")
    logger.info("[DOCS] API Docs: http://localhost:8000/docs")

    yield

    logger.info("BloodBridge AI Backend shutting down...")


# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="BloodBridge AI",
    description="Predictive Care & Donor Intelligence Platform API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(patients_router)
app.include_router(donors_router)
app.include_router(matches_router)
app.include_router(forecasts_router)
app.include_router(outreach_router)
app.include_router(analytics_router)
app.include_router(awareness_router)
app.include_router(chatbot_router)
app.include_router(settings_router)


# ─── WebSocket ────────────────────────────────────────────────────────────────
@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    await websocket_handler(websocket)


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "BloodBridge AI Backend",
        "version": settings.app_version,
        "database": "SQLite (local)",
        "ai_mode": "Bedrock" if settings.use_bedrock else "Local",
    }


@app.get("/")
def root():
    return {
        "message": "BloodBridge AI API",
        "docs": "/docs",
        "health": "/health",
        "version": settings.app_version,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app", 
        host="0.0.0.0", 
        port=8001, 
        reload=True
    )
