import { useRef, useState } from 'react';
import { useImmer } from 'use-immer';
import api from '@/api';
import { parseSSEStream } from '@/utils';
import ChatMessages from '@/components/ChatMessages';
import ChatInput from '@/components/ChatInput';
import useSpeechSynthesis from '@/hooks/useSpeechSynthesis';

function Chatbot() {
  const [messages, setMessages] = useImmer([]);
  const [newMessage, setNewMessage] = useState('');
  const [autoRead, setAutoRead] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [liveUserCaption, setLiveUserCaption] = useState('');
  const [liveAssistantCaption, setLiveAssistantCaption] = useState('');
  const [liveActive, setLiveActive] = useState(false);
  const [transcript, setTranscript] = useImmer([]); // {id, role, text, live, ts}
  const liveIdsRef = useRef({ user: null, assistant: null });
  const { supported: ttsSupported, speaking, speak, cancel } = useSpeechSynthesis();

  const isLoading = messages.length && messages[messages.length - 1].loading;

  async function submitNewMessage() {
    const trimmedMessage = newMessage.trim();
    if (!trimmedMessage || isLoading) return;

    setMessages(draft => [...draft,
      { role: 'user', content: trimmedMessage },
      { role: 'assistant', content: '', loading: true }
    ]);
    setNewMessage('');
    // Persist user typed text in transcript log
    setTranscript(draft => {
      draft.push({ id: `u-${Date.now()}`, role: 'user', text: trimmedMessage, live: false, ts: Date.now() });
    });

    try {
      // Prefer streaming for smooth typing animation
      let finalText = '';
      const stripAssistantPrefix = (s) => s.replace(/^\s*(HopeAI:|Assistant:)\s*/i, '');
      try {
        const stream = await api.sendMessageStream(trimmedMessage);
        let started = false;
        for await (const chunk of parseSSEStream(stream)) {
          const update = (!started ? stripAssistantPrefix(chunk) : chunk);
          finalText += update;
          setMessages(draft => {
            draft[draft.length - 1].content += update;
          });
          // Update transcript live assistant line
          setTranscript(draft => {
            if (!started) {
              const id = `a-${Date.now()}`;
              liveIdsRef.current.assistant = id;
              draft.push({ id, role: 'assistant', text: update, live: true, ts: Date.now() });
              started = true;
            } else {
              const idx = draft.findIndex(d => d.id === liveIdsRef.current.assistant);
              if (idx >= 0) draft[idx].text += update;
            }
          });
        }
        setMessages(draft => {
          draft[draft.length - 1].loading = false;
        });
        // Finalize transcript assistant line
        setTranscript(draft => {
          const idx = draft.findIndex(d => d.id === liveIdsRef.current.assistant);
          if (idx >= 0) draft[idx].live = false;
          liveIdsRef.current.assistant = null;
        });
      } catch (streamErr) {
        // Fallback to non-streaming
        const { reply } = await api.sendMessage(trimmedMessage);
        finalText = stripAssistantPrefix(reply || '');
        setMessages(draft => {
          draft[draft.length - 1].content = finalText;
          draft[draft.length - 1].loading = false;
        });
        setTranscript(draft => {
          draft.push({ id: `a-${Date.now()}`, role: 'assistant', text: finalText, live: false, ts: Date.now() });
        });
      }
      if (autoRead && ttsSupported && finalText) {
        try { if (speaking) cancel(); speak(finalText); } catch (_) {}
      }
    } catch (err) {
      console.log(err);
      const detail = err?.data?.detail || err?.data?.message || err?.message || null;
      setMessages(draft => {
        draft[draft.length - 1].loading = false;
        draft[draft.length - 1].error = detail || 'Error generating the response';
      });
    }
  }

  function handleVoiceTurn({ userText, assistantText }) {
    // Only add the assistant's final reply to chat, not the spoken user query
    // The user's spoken transcript remains in the persistent transcript log.
    if (assistantText && assistantText.trim()) {
      setMessages(draft => {
        draft.push({ role: 'assistant', content: assistantText.trim() });
      });
      // Also persist in transcript log as finalized assistant line
      setTranscript(draft => {
        draft.push({ id: `a-${Date.now()}`, role: 'assistant', text: assistantText.trim(), live: false, ts: Date.now() });
      });
    }
    // Mark any live transcript entries as finalized once the turn completes
    setTranscript(draft => { draft.forEach(e => { if (e.live) e.live = false; }); });
    if (autoRead && ttsSupported && assistantText) {
      try { if (speaking) cancel(); speak(assistantText); } catch (_) {}
    }
  }

  function buildTranscript() {
    return transcript
      .map(e => `${e.role === 'user' ? 'User' : 'HopeAI'}${e.live ? ' (live)' : ''}: ${e.text}`)
      .join('\n');
  }

  async function copyTranscript() {
    try {
      const text = buildTranscript();
      await navigator.clipboard.writeText(text);
      // no toast system; silent success
    } catch (e) {
      console.error('Copy failed', e);
    }
  }

  function downloadTranscript() {
    try {
      const text = buildTranscript();
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'hopeai_transcript.txt';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download failed', e);
    }
  }

  function handleTranscriptUpdate({ user, assistant, active }) {
    setLiveUserCaption(user || '');
    setLiveAssistantCaption(assistant || '');
    setLiveActive(!!active);
    const now = Date.now();
    setTranscript(draft => {
      if (active) {
        if (user !== undefined) {
          if (!liveIdsRef.current.user) {
            const id = `u-${now}`;
            liveIdsRef.current.user = id;
            draft.push({ id, role: 'user', text: user || '', live: true, ts: now });
          } else {
            const idx = draft.findIndex(d => d.id === liveIdsRef.current.user);
            if (idx >= 0) draft[idx].text = user || '';
          }
        }
        if (assistant !== undefined) {
          if (!liveIdsRef.current.assistant) {
            const id = `a-${now}`;
            liveIdsRef.current.assistant = id;
            draft.push({ id, role: 'assistant', text: assistant || '', live: true, ts: now });
          } else {
            const idx = draft.findIndex(d => d.id === liveIdsRef.current.assistant);
            if (idx >= 0) draft[idx].text = assistant || '';
          }
        }
      } else {
        if (liveIdsRef.current.user) {
          const idx = draft.findIndex(d => d.id === liveIdsRef.current.user);
          if (idx >= 0) draft[idx].live = false;
          liveIdsRef.current.user = null;
        }
        if (liveIdsRef.current.assistant) {
          const idx = draft.findIndex(d => d.id === liveIdsRef.current.assistant);
          if (idx >= 0) draft[idx].live = false;
          liveIdsRef.current.assistant = null;
        }
      }
    });
  }

  return (
    <div className='relative grow flex flex-col gap-6 pt-6'>
      <div className='flex items-center gap-3 text-sm text-primary-blue/80'>
        <button
          className='px-3 py-1 rounded-md ring-1 ring-primary-blue hover:bg-primary-blue/10'
          onClick={() => setShowTools(v => !v)}
          title='Show transcript tools'
        >
          {showTools ? 'Hide transcript tools' : 'Show transcript tools'}
        </button>
      </div>
      {liveActive && (
        <div className='rounded-lg ring-1 ring-primary-blue/30 bg-primary-blue/10 px-4 py-3 text-sm text-primary-blue/90 space-y-1'>
          <div>
            <span className='font-semibold'>You: </span>
            <span className={liveUserCaption ? '' : 'italic opacity-70'}>{liveUserCaption || 'Listening…'}</span>
          </div>
          <div>
            <span className='font-semibold'>HopeAI: </span>
            <span className={liveAssistantCaption ? '' : 'italic opacity-70'}>{liveAssistantCaption || '…'}</span>
          </div>
        </div>
      )}
      {/* Persistent transcript log (kept for the whole tab session) */}
      {(
        <div className='rounded-lg ring-1 ring-primary-blue/20 bg-primary-blue/5 px-4 py-3 text-sm text-primary-blue/90 max-h-56 overflow-auto'>
          {transcript.length === 0 ? (
            <div className='italic opacity-70'>Transcript will appear here as you speak or chat.</div>
          ) : (
            transcript.map((e) => (
              <div key={e.id} className='whitespace-pre-wrap'>
                <span className='font-semibold'>{e.role === 'user' ? 'You' : 'HopeAI'}: </span>
                <span>{e.text}</span>
                {e.live && <span className='italic opacity-70'> (live)</span>}
              </div>
            ))
          )}
        </div>
      )}
      {showTools && (
        <div className='flex items-center gap-3 text-sm text-primary-blue/80'>
          {ttsSupported && (
            <label className='flex items-center gap-2'>
              <input
                type='checkbox'
                checked={autoRead}
                onChange={() => { if (speaking) cancel(); setAutoRead(v => !v); }}
              />
              Auto-read replies
            </label>
          )}
          <button
            className='px-3 py-1 rounded-md ring-1 ring-primary-blue hover:bg-primary-blue/10 disabled:opacity-40'
            onClick={copyTranscript}
            disabled={!transcript.length}
            title='Copy full transcript to clipboard'
          >
            Copy transcript
          </button>
          <button
            className='px-3 py-1 rounded-md ring-1 ring-primary-blue hover:bg-primary-blue/10 disabled:opacity-40'
            onClick={downloadTranscript}
            disabled={!transcript.length}
            title='Download transcript as .txt'
          >
            Download transcript
          </button>
        </div>
      )}
      {messages.length === 0 && (
        <div className='mt-3 font-urbanist text-primary-blue text-xl font-light space-y-2'>
          <p>👋 Welcome!</p>
          <p>I’m HopeAI — a virtual assistant focused on drug usage and prevention.</p>
          <p>Ask about substance use risks, prevention strategies, resources, or getting help.</p>
        </div>
      )}
      <ChatMessages
        messages={messages}
        isLoading={isLoading}
      />
      <ChatInput
        newMessage={newMessage}
        isLoading={isLoading}
        setNewMessage={setNewMessage}
        submitNewMessage={submitNewMessage}
        onTranscriptUpdate={handleTranscriptUpdate}
        onVoiceTurn={handleVoiceTurn}
      />
    </div>
  );
}

export default Chatbot;
