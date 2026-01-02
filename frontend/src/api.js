
const BASE_URL = import.meta.env.VITE_API_URL;

async function sendMessage(message) {
  const res = await fetch(BASE_URL + '/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ message })
  });
  if (!res.ok) {
    let data;
    try { data = await res.json(); } catch (_) { data = { message: 'Request failed' }; }
    return Promise.reject({ status: res.status, data });
  }
  const data = await res.json();
  return data;
}

export default { sendMessage };

export async function getRealtimeToken(body) {
  const res = await fetch(BASE_URL + '/realtime/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    let data;
    try { data = await res.json(); } catch (_) { data = { message: 'Request failed' }; }
    return Promise.reject({ status: res.status, data });
  }
  return res.json();
}

export async function sendMessageStream(message) {
  const res = await fetch(BASE_URL + '/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
    body: JSON.stringify({ message })
  });
  if (!res.ok) {
    let data;
    try { data = await res.json(); } catch (_) { data = { message: 'Request failed' }; }
    return Promise.reject({ status: res.status, data });
  }
  return res.body; // ReadableStream of SSE
}
