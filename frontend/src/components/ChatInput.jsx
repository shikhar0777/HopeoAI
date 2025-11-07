

import { useEffect, useRef, useState } from 'react';
import useAutosize from '@/hooks/useAutosize';
import sendIcon from '@/assets/images/send.svg';
import micIcon from '@/assets/images/mic.svg';
import stopIcon from '@/assets/images/stop.svg';
import { getRealtimeToken } from '@/api';

function ChatInput({ newMessage, isLoading, setNewMessage, submitNewMessage, onVoiceTurn, onTranscriptUpdate }) {
  const textareaRef = useAutosize(newMessage);
  const [voiceActive, setVoiceActive] = useState(false);
  const [startingVoice, setStartingVoice] = useState(false);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const sendDCRef = useRef(null);
  const assistantBufRef = useRef('');
  const userBufRef = useRef('');
  const [userCaption, setUserCaption] = useState('');
  const [assistantCaption, setAssistantCaption] = useState('');
  const [voice, setVoice] = useState('verse');

  function handleKeyDown(e) {
    if(e.keyCode === 13 && !e.shiftKey && !isLoading) {
      e.preventDefault();
      submitNewMessage();
    }
  }

  async function startVoice() {
    if (voiceActive) return;
    try {
      setStartingVoice(true);
      onTranscriptUpdate && onTranscriptUpdate({ user: '', assistant: '', active: true });
      const token = await getRealtimeToken({ voice });
      const ephemeral = token?.client_secret?.value || token?.client_secret || token?.value;
      if (!ephemeral) throw new Error('Failed to obtain realtime token');
      const model = import.meta.env.VITE_OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-12-17';

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Remote audio
      if (!remoteAudioRef.current) {
        remoteAudioRef.current = new Audio();
        remoteAudioRef.current.autoplay = true;
      }
      pc.ontrack = (e) => {
        remoteAudioRef.current.srcObject = e.streams[0];
      };

      // Local mic
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = ms;
      ms.getTracks().forEach(t => pc.addTrack(t, ms));

      // Data channel handling
      const handleDCMessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          const t = data?.type || '';
          if (t === 'response.output_text.delta' || t === 'response.audio_transcript.delta' || t === 'response.refusal.delta') {
            let delta = data?.delta || data?.text || '';
            if (assistantBufRef.current.length === 0) {
              delta = delta.replace(/^\s*(HopeAI:|Assistant:)\s*/i, '');
            }
            assistantBufRef.current += delta;
            setAssistantCaption(assistantBufRef.current);
            onTranscriptUpdate && onTranscriptUpdate({ user: userBufRef.current, assistant: assistantBufRef.current, active: true });
          } else if (t === 'response.completed' || t === 'response.output_text.done' || t === 'response.audio_transcript.done') {
            const assistant = assistantBufRef.current.trim();
            setAssistantCaption('');
            if (onVoiceTurn) onVoiceTurn({ userText: userBufRef.current.trim(), assistantText: assistant });
            assistantBufRef.current = '';
            userBufRef.current = '';
            onTranscriptUpdate && onTranscriptUpdate({ user: '', assistant: '', active: false });
          } else if (t === 'input_audio_buffer.speech_started' || t === 'response.started') {
            userBufRef.current = '';
            setUserCaption('');
            onTranscriptUpdate && onTranscriptUpdate({ user: '', assistant: assistantCaption, active: true });
          } else if (t === 'input_audio_buffer.transcript.delta' || t === 'input_audio_buffer.speech_transcript.delta') {
            userBufRef.current += (data.delta || data.text || '');
            setUserCaption(userBufRef.current);
            onTranscriptUpdate && onTranscriptUpdate({ user: userBufRef.current, assistant: assistantCaption, active: true });
          } else if (t === 'input_audio_buffer.transcript.completed' || t === 'input_audio_buffer.speech_transcript.done') {
            // user transcript final
          }
        } catch (e) {
          // ignore
        }
      };

      pc.ondatachannel = (e) => {
        const ch = e.channel;
        ch.onmessage = handleDCMessage;
      };
      // Create our own channel; some Realtime versions send events back on this same channel
      sendDCRef.current = pc.createDataChannel('oai-events');
      sendDCRef.current.onmessage = handleDCMessage;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpResponse = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ephemeral}`,
          'Content-Type': 'application/sdp',
          'OpenAI-Beta': 'realtime=v1'
        },
        body: offer.sdp
      });
      const answer = await sdpResponse.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });
      setVoiceActive(true);
      setStartingVoice(false);
      onTranscriptUpdate && onTranscriptUpdate({ user: '', assistant: '', active: true });
    } catch (e) {
      console.error(e);
      setStartingVoice(false);
      stopVoice();
    }
  }

  function stopVoice() {
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
      if (pcRef.current) {
        pcRef.current.getSenders().forEach(s => { try { s.track?.stop(); } catch (_) {} });
        pcRef.current.close();
        pcRef.current = null;
      }
      setUserCaption('');
      setAssistantCaption('');
      onTranscriptUpdate && onTranscriptUpdate({ user: '', assistant: '', active: false });
      setVoiceActive(false);
    } catch (_) {
      setVoiceActive(false);
    }
  }
  
  return(
    <div className='sticky bottom-0 shrink-0 bg-white py-4'>
      <div className='p-1.5 bg-primary-blue/35 rounded-3xl z-50 font-mono origin-bottom animate-chat duration-400'>
        {startingVoice && !voiceActive && (
          <div className='flex justify-center pb-2'>
            <div className='px-3 py-1 rounded-full bg-primary-blue/10 text-primary-blue text-xs font-medium animate-pulse'>Starting…</div>
          </div>
        )}
        {/* live transcript is shown in Chatbot top panel via onTranscriptUpdate */}
        <div className='pr-0.5 bg-white relative shrink-0 rounded-3xl overflow-hidden ring-primary-blue ring-1 focus-within:ring-2 transition-all'>
          <div className='absolute left-3 -top-8 flex items-center gap-2 text-xs text-primary-blue/80'>
            <label htmlFor='voice' className='sr-only'>Voice</label>
            <select id='voice' className='ring-1 ring-primary-blue rounded-md px-2 py-0.5 bg-white'
              value={voice} onChange={(e) => setVoice(e.target.value)}
              title='Select voice for real-time chat'>
              <option value='verse'>Verse</option>
              <option value='alloy'>Alloy</option>
              <option value='aria'>Aria</option>
              <option value='sage'>Sage</option>
              <option value='ballad'>Ballad</option>
              <option value='tenor'>Tenor</option>
            </select>
          </div>
          <textarea
            className='block w-full max-h-[140px] py-2 pl-11 pr-11 px-4 bg-white rounded-3xl resize-none placeholder:text-primary-blue placeholder:leading-4 placeholder:-translate-y-1 sm:placeholder:leading-normal sm:placeholder:translate-y-0 focus:outline-hidden'
            ref={textareaRef}
            rows='1'
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className={`absolute top-1/2 -translate-y-1/2 left-3 p-1 rounded-md ${voiceActive ? 'bg-primary-blue/20' : 'hover:bg-primary-blue/20'} ${(isLoading || startingVoice) ? 'opacity-40 cursor-not-allowed' : ''}`}
            onClick={() => voiceActive ? stopVoice() : startVoice()}
            disabled={isLoading || startingVoice}
            aria-label={voiceActive ? 'Stop voice chat' : 'Start voice chat'}
            title={voiceActive ? 'Stop voice chat' : 'Start real-time voice chat'}
          >
            <img src={voiceActive ? stopIcon : micIcon} alt={voiceActive ? 'stop' : 'mic'} />
          </button>
          <button
            className='absolute top-1/2 -translate-y-1/2 right-3 p-1 rounded-md hover:bg-primary-blue/20'
            onClick={submitNewMessage}
          >
            <img src={sendIcon} alt='send' />
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatInput;
