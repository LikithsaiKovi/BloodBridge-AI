"""
WebSocket handler for real-time Command Center updates.
"""
import asyncio
import json
from datetime import datetime
from typing import Set
from fastapi import WebSocket, WebSocketDisconnect
import logging

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections."""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info("WS client connected. Total: %d", len(self.active_connections))

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info("WS client disconnected. Total: %d", len(self.active_connections))

    async def broadcast(self, event: dict):
        """Broadcast event to all connected clients."""
        if not self.active_connections:
            return
        message = json.dumps(event)
        dead = set()
        for ws in self.active_connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        self.active_connections -= dead

    async def send_personal(self, websocket: WebSocket, event: dict):
        await websocket.send_text(json.dumps(event))


manager = ConnectionManager()


def make_event(event_type: str, title: str, message: str, severity: str = "info", data: dict = None) -> dict:
    return {
        "event_type": event_type,
        "title": title,
        "message": message,
        "severity": severity,
        "data": data or {},
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


async def websocket_handler(websocket: WebSocket):
    """Main WebSocket connection handler."""
    await manager.connect(websocket)

    # Send welcome event
    await manager.send_personal(websocket, make_event(
        "system_ready",
        "BloodBridge AI Connected",
        "Real-time monitoring active. Watching for events...",
        "info"
    ))

    # Start heartbeat and live simulator
    asyncio.create_task(heartbeat(websocket))
    asyncio.create_task(live_event_simulator())

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await manager.send_personal(websocket, {"type": "pong", "timestamp": datetime.utcnow().isoformat() + "Z"})
                elif msg.get("type") == "trigger_match":
                    await manager.broadcast(make_event(
                        "match_running",
                        "AI Matching Started",
                        f"Finding donors for patient {msg.get('patient_id', '')}",
                        "info"
                    ))
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)


async def heartbeat(websocket: WebSocket):
    """Send periodic heartbeat to keep connection alive."""
    try:
        while True:
            await asyncio.sleep(30)
            await websocket.send_text(json.dumps({"type": "heartbeat", "timestamp": datetime.utcnow().isoformat() + "Z"}))
    except Exception:
        pass


# Simulated live events (replace with real event triggers in production)
_simulator_running = False

async def live_event_simulator():
    """Simulate realistic live events for demo purposes."""
    global _simulator_running
    if _simulator_running:
        return
    _simulator_running = True

    import random
    events_pool = [
        lambda: make_event("donor_found", "New Donor Found", f"Donor {random.choice(['Rahul V.', 'Sneha J.', 'Amit S.', 'Priya D.'])} matched for patient", "info"),
        lambda: make_event("donor_confirmed", "Donor Confirmed! 🎉", f"Blood donation confirmed for {random.choice(['Jun 8', 'Jun 9', 'Jun 10'])}", "success"),
        lambda: make_event("patient_risk_alert", "⚠️ Patient Risk Alert", f"Patient requires blood within {random.choice([1, 2, 3])} day(s)", "critical"),
        lambda: make_event("donation_completed", "Donation Completed ✅", f"Successful transfusion completed at {random.choice(['Apollo Hospital', 'Fortis', 'Lilavati'])}", "success"),
        lambda: make_event("prediction_update", "AI Prediction Updated", f"Blood demand forecast updated. {random.choice(['O+', 'A+', 'B+'])} demand rising", "warning"),
        lambda: make_event("new_match", "Match Found", f"AI matched {random.choice(['3', '5', '7'])} compatible donors", "info"),
    ]

    while True:
        await asyncio.sleep(60) # Just sleep, don't simulate
        # if manager.active_connections:
        #     event = random.choice(events_pool)()
        #     await manager.broadcast(event)


async def broadcast_event(event_type: str, title: str, message: str, severity: str = "info", data: dict = None):
    """Public API to broadcast events from anywhere in the app."""
    event = make_event(event_type, title, message, severity, data)
    await manager.broadcast(event)


def sync_broadcast_event(event_type: str, title: str, message: str, severity: str = "info", data: dict = None):
    """Synchronous helper to broadcast events from sync endpoints."""
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(broadcast_event(event_type, title, message, severity, data))
    except RuntimeError:
        # If no event loop, we can't easily broadcast without creating a new thread,
        # but in FastAPI there should always be a running loop.
        pass
