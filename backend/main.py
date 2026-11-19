# backend/main.py
"""
Unit 10 — Entrega 2 lab contract (Template v1 + Delta Streaming) adapted for Bitcoin Quote Telemetry.
Lesson: https://ruvebal.github.io/web-atelier-udit/lessons/en/feii/unit-10-iot-python-backend/

Run locally:
  python3 -m venv .venv
  .venv/bin/pip install "fastapi" "uvicorn[standard]"
  .venv/bin/uvicorn main:app --reload --port 8000
"""
import asyncio
import math
import time
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DEVICE_ID = "btc-ticker-01"
BASE_PRICE_USD = 92450.0
FRONTEND_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(delta_clock())
    yield
    task.cancel()


app = FastAPI(title="FE II Unit 10 Bitcoin & Device Contract", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class DeviceCommand(BaseModel):
    command: Literal["move", "stop"]
    target: dict[str, float] | None = None


def snapshot(sequence: int) -> dict:
    """Build one telemetry frame (JSON message). Not a Rive Snapshot."""
    phase = sequence / 4
    wave = math.sin(phase) * 380 + math.cos(sequence * 0.85) * 110
    price_usd = round(BASE_PRICE_USD + wave, 2)
    change_24h_pct = round(2.4 + math.cos(phase) * 1.6, 2)
    volume_btc = round(18420 + math.sin(phase * 0.5) * 650, 1)

    return {
        "kind": "snapshot",
        "deviceId": DEVICE_ID,
        "symbol": "BTC/USDT",
        "online": True,
        "readings": {
            "priceUsd": price_usd,
            "change24hPct": change_24h_pct,
            "volumeBtc": volume_btc,
            "temperatureC": round(21 + math.sin(phase) * 2, 1),
            "humidityPct": round(45 + math.cos(phase) * 5, 1),
        },
        "sequence": sequence,
        "timestamp": int(time.time() * 1000),
    }


@app.get("/v1/devices/lab-01")
async def get_device() -> dict:
    return snapshot(sequence=0)


@app.post("/v1/devices/lab-01/commands")
async def send_command(command: DeviceCommand) -> dict:
    return {
        "deviceId": DEVICE_ID,
        "accepted": True,
        "source": "fastapi-v1",
        "command": command.command,
        "target": command.target,
    }


@app.websocket("/v1/devices/lab-01/stream")
async def device_stream(websocket: WebSocket) -> None:
    await websocket.accept()
    sequence = 0
    try:
        while True:
            await websocket.send_json(snapshot(sequence))
            sequence += 1
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass


# --- Continuous flow: Delta Streaming on FastAPI (/v1/devices/lab-01/delta) ---
KEYFRAME_EVERY = 8
delta_clients: set[WebSocket] = set()
delta_sequence = 0


def delta_readings(sequence: int) -> dict:
    phase = sequence / 4
    held_step = sequence // 4
    wave = math.sin(phase) * 380 + math.cos(sequence * 0.85) * 110
    return {
        "priceUsd": round(BASE_PRICE_USD + wave, 2),
        "change24hPct": round(2.4 + math.cos(held_step) * 1.6, 2),
        "volumeBtc": round(18420 + math.sin(held_step * 0.5) * 650, 1),
        "temperatureC": round(21 + math.sin(phase) * 2, 1),
        "humidityPct": round(45 + math.cos(held_step) * 5, 1),
    }


delta_readings_now = delta_readings(0)


def snapshot_message(sequence: int, readings: dict) -> dict:
    return {
        "kind": "snapshot",
        "deviceId": DEVICE_ID,
        "symbol": "BTC/USDT",
        "online": True,
        "readings": readings,
        "sequence": sequence,
        "timestamp": int(time.time() * 1000),
    }


def delta_message(sequence: int, previous: dict, readings: dict) -> dict:
    patch = {k: v for k, v in readings.items() if v != previous.get(k)}
    return {
        "kind": "delta",
        "deviceId": DEVICE_ID,
        "sequence": sequence,
        "timestamp": int(time.time() * 1000),
        "patch": patch,
    }


async def delta_clock() -> None:
    global delta_sequence, delta_readings_now
    while True:
        await asyncio.sleep(1)
        previous = delta_readings_now
        delta_sequence += 1
        delta_readings_now = delta_readings(delta_sequence)
        if delta_sequence % KEYFRAME_EVERY == 0:
            msg = snapshot_message(delta_sequence, delta_readings_now)
        else:
            msg = delta_message(delta_sequence, previous, delta_readings_now)
        for ws in list(delta_clients):
            try:
                await ws.send_json(msg)
            except Exception:
                delta_clients.discard(ws)


@app.websocket("/v1/devices/lab-01/delta")
async def device_delta_stream(websocket: WebSocket) -> None:
    await websocket.accept()
    delta_clients.add(websocket)
    await websocket.send_json(snapshot_message(delta_sequence, delta_readings_now))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        delta_clients.discard(websocket)
