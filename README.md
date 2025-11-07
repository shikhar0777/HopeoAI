# HopeAI Assistant (Simple)

A minimal full‑stack chatbot using FastAPI + OpenAI on the backend and React (Vite) on the frontend. The assistant follows this prompt:

"you are an virtual ai assistant for hopeai. you response should be only related to drug usage and prevention, if any other question ask don't help"

No databases, no streams, just a single POST `/chat` endpoint returning JSON.

## Structure
- `backend/`: Minimal FastAPI app with one endpoint.
- `frontend/`: React UI with optional voice input/output.

## Setup

Prereqs:
- Python 3.11+
- Node.js 18+
- Poetry

Backend:
- `cd backend && cp .env.example .env` and put your real `OPENAI_API_KEY`
- `poetry install`
- Run: `poetry run uvicorn app.main:app --reload --port 8000`

Frontend:
- `cd frontend && cp .env.example .env.development`
- Set `VITE_API_URL=http://localhost:8000`
- `npm install && npm run dev`
- Open `http://localhost:3000`

## Endpoint
- `POST /chat` with body `{ "message": "..." }` → `{ "reply": "..." }`

## Voice
- Real‑time voice chat is available via the mic button. It uses OpenAI Realtime with WebRTC. When you click the mic, the browser connects directly to OpenAI using a short‑lived token from the backend and streams your microphone; the assistant replies with live audio.
- Typed chat still works via POST `/chat`.

Config:
- Backend requires `OPENAI_API_KEY`.
- Optional envs:
  - Backend: `OPENAI_REALTIME_MODEL` (default `gpt-4o-realtime-preview-2024-12-17`), `OPENAI_REALTIME_VOICE` (default `verse`).
  - Frontend: `VITE_OPENAI_REALTIME_MODEL` to override the model used by the browser SDP offer.

Permissions:
- Allow microphone access in your browser when prompted.
