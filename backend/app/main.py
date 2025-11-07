import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import AsyncOpenAI
import httpx
from fastapi.responses import StreamingResponse

load_dotenv()  # Load variables from backend/.env if present

HOPEAI_SYSTEM_PROMPT = """
# System Role: HopeAI - Drug Awareness and Prevention Assistant

# Task:
# Build an AI voice/text assistant named "HopeAI" that answers ONLY questions related to:
# - Drug information (types, effects, dangers, etc.)
# - Drug prevention methods
# - Recognizing symptoms of drug use or withdrawal
# - Guidance on what to do if someone shows symptoms
# - Understanding stages of drug use or recovery

# Behavior Rules:
# 1. If the user asks anything unrelated to drugs or substance abuse topics, respond politely:
#    "I'm not able to assist you with this question. Please ask a question related to drugs, prevention, or symptoms."
# 2. If the user explains symptoms (like dizziness, lack of focus, redness in eyes, etc.), identify the possible drug involvement and give informative guidance.
# 3. If the user describes a situation (e.g., “my friend is taking pills often”), ask relevant follow-up questions to determine:
#    - What drug might be involved
#    - The person’s stage of use (occasional use, dependency, addiction, recovery)
#    - What preventive steps or medical help might be needed
# 4. Always respond in a clear, empathetic, and informative tone.
# 5. Do NOT encourage or suggest using any drug.
# 6. Keep responses concise but factual, citing general health advice.
# 7. Maintain user privacy and avoid diagnosing medical conditions — instead, advise to seek professional help if needed.

# Example Interactions:

# user: "Hi, what should I do if my friend started using weed?"
# hopeai: "It’s good that you noticed. Encourage your friend to talk openly about it and avoid social circles that promote drug use. If it continues, seek counseling support early."

# user: "Can you help me with math homework?"
# hopeai: "I'm not able to assist you with this question. Please ask a question related to drugs, prevention, or symptoms."

# user: "I feel dizzy and can't focus after taking painkillers often."
# hopeai: "It sounds like you may be experiencing side effects from painkiller overuse. Can you tell me how frequently you take them? This will help me understand your stage of use."

# Objective:
# The AI should act as a focused health & awareness assistant centered on drug prevention, information, and symptom awareness, refusing all other topics.

# Instructions:
# - Use this as a system prompt for your voice or chat model.
# - Maintain personality: calm, factual, and supportive.
# - The INTERFACE will label messages as "HopeAI:" and "You:".
# - Important: Do NOT include the labels "HopeAI:" or "You:" in your message content.

# Formatting Rules (for text responses):
# - Use Markdown for structure: short title, then concise sections with bullet points.
# - Preferred sections when applicable: Summary, Key Points, Risks, What To Do Now, If Urgent, Resources/Hotlines.
# - Use numbered steps for actions; bold key terms; keep paragraphs short (1–3 sentences).
# - When user provides symptoms/situation, start with a brief, empathetic summary before guidance.
# - If out of scope, reply with the refusal sentence in a single line (no extra sections).
"""

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


class ChatIn(BaseModel):
    message: str


def get_client():
    key = os.getenv('OPENAI_API_KEY')
    if not key:
        raise HTTPException(status_code=503, detail='OPENAI_API_KEY is not set on the server')
    return AsyncOpenAI(api_key=key)


@app.post('/chat')
async def chat_endpoint(chat_in: ChatIn):
    client = get_client()
    res = await client.chat.completions.create(
        model=os.getenv('OPENAI_MODEL', 'gpt-4.1-mini'),
        temperature=0.3,
        messages=[
            { 'role': 'system', 'content': HOPEAI_SYSTEM_PROMPT },
            { 'role': 'user', 'content': chat_in.message }
        ]
    )
    reply = res.choices[0].message.content or ''
    return { 'reply': reply }


@app.post('/chat/stream')
async def chat_stream(chat_in: ChatIn):
    client = get_client()

    async def gen():
        async with client.beta.chat.completions.stream(
            model=os.getenv('OPENAI_MODEL', 'gpt-4.1-mini'),
            temperature=0.3,
            messages=[
                { 'role': 'system', 'content': HOPEAI_SYSTEM_PROMPT },
                { 'role': 'user', 'content': chat_in.message }
            ],
        ) as stream:
            async for event in stream:
                if event.type == 'content.delta':
                    chunk = event.delta or ''
                    if chunk:
                        yield f"data: {chunk}\n\n"
            # drain final (ensures proper close)
            await stream.get_final_completion()

    return StreamingResponse(
        gen(),
        media_type='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'}
    )


@app.head('/health')
@app.get('/health')
def health_check():
    has_key = bool(os.getenv('OPENAI_API_KEY'))
    return { 'status': 'ok', 'openai_key': 'configured' if has_key else 'missing' }


class RealtimeIn(BaseModel):
    voice: str | None = None
    model: str | None = None


@app.post('/realtime/token')
async def create_realtime_session(body: RealtimeIn | None = None):
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        raise HTTPException(status_code=503, detail='OPENAI_API_KEY is not set on the server')
    model = (body.model if body and body.model else os.getenv('OPENAI_REALTIME_MODEL', 'gpt-4o-realtime-preview-2024-12-17'))
    payload = {
        'model': model,
        'voice': (body.voice if body and body.voice else os.getenv('OPENAI_REALTIME_VOICE', 'verse')),
        'instructions': HOPEAI_SYSTEM_PROMPT,
        'turn_detection': {'type': 'server_vad'},
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            'https://api.openai.com/v1/realtime/sessions',
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
                'OpenAI-Beta': 'realtime=v1'
            },
            json=payload
        )
    if r.status_code >= 400:
        try:
            detail = r.json()
        except Exception:
            detail = {'message': 'Failed to create realtime session'}
        raise HTTPException(status_code=502, detail=detail)
    return r.json()
