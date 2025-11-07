import { useState } from 'react';
import Markdown from 'react-markdown';
import useAutoScroll from '@/hooks/useAutoScroll';
import useSpeechSynthesis from '@/hooks/useSpeechSynthesis';
import Spinner from '@/components/Spinner';
import userIcon from '@/assets/images/user.svg';
import errorIcon from '@/assets/images/error.svg';
import speakerIcon from '@/assets/images/speaker.svg';
import stopIcon from '@/assets/images/stop.svg';

function ChatMessages({ messages, isLoading }) {
  const scrollContentRef = useAutoScroll(isLoading);
  const { supported: ttsSupported, speaking, speak, cancel } = useSpeechSynthesis();
  const [activeIdx, setActiveIdx] = useState(null);
  
  function handleSpeak(idx, text) {
    if (!ttsSupported || !text) return;
    if (speaking && activeIdx === idx) {
      cancel();
      setActiveIdx(null);
    } else {
      speak(text);
      setActiveIdx(idx);
    }
  }
  
  return (
    <div ref={scrollContentRef} className='grow space-y-4'>
      {messages.map(({ role, content, loading, error }, idx) => (
        <div key={idx} className={`flex items-start gap-4 py-4 px-3 rounded-xl ${role === 'user' ? 'bg-primary-blue/10' : ''}`}>
          {role === 'user' && (
            <img
              className='h-[26px] w-[26px] shrink-0'
              src={userIcon}
              alt='user'
            />
          )}
          <div className='relative w-full'>
            <div className='markdown-container'>
              {(loading && !content) ? <Spinner /> : (
                role === 'assistant'
                  ? (
                      <div>
                        <div className='font-semibold'>HopeAI:</div>
                        <div className='markdown-container'>
                          <Markdown>{content}</Markdown>
                        </div>
                      </div>
                    )
                  : (
                      <div className='whitespace-pre-line'>
                        <span className='font-semibold'>You: </span>{content}
                      </div>
                    )
              )}
            </div>
            {(role === 'assistant' && !loading && content && ttsSupported) && (
              <button
                className='absolute top-0 right-0 p-1 rounded-md hover:bg-primary-blue/20'
                onClick={() => handleSpeak(idx, content)}
                aria-label={(speaking && activeIdx === idx) ? 'Stop voice playback' : 'Play voice playback'}
                title={(speaking && activeIdx === idx) ? 'Stop voice playback' : 'Play voice playback'}
              >
                <img src={(speaking && activeIdx === idx) ? stopIcon : speakerIcon} alt='speak' />
              </button>
            )}
            {error && (
              <div className={`flex items-center gap-1 text-sm text-error-red ${content && 'mt-2'}`}>
                <img className='h-5 w-5' src={errorIcon} alt='error' />
                <span>{typeof error === 'string' ? error : 'Error generating the response'}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default ChatMessages;
