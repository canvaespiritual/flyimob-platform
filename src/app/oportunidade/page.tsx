'use client';

import { useEffect, useState } from 'react';

const VIDEO_ID = '6a2ac830c7a04b5a3db0ea11';
const VTURB_SCRIPT =
  'https://scripts.converteai.net/ab0d5dbd-353e-4147-a5c6-52ab96121828/players/6a2ac830c7a04b5a3db0ea11/v4/player.js';

const REVEAL_AT_SECONDS = 1702; // 28min22s

const WHATSAPP_NUMBER = '5562982498504';
const WHATSAPP_MESSAGE = 'PONTE';

export default function OportunidadePage() {
  const [showCta, setShowCta] = useState(false);

  useEffect(() => {
    const storageKey = `vturb_progress_${VIDEO_ID}`;

    const savedProgress = Number(localStorage.getItem(storageKey) || 0);

    if (savedProgress >= REVEAL_AT_SECONDS) {
      setShowCta(true);
    }

    const scriptAlreadyExists = document.querySelector(
      `script[src="${VTURB_SCRIPT}"]`
    );

    if (!scriptAlreadyExists) {
      const script = document.createElement('script');
      script.src = VTURB_SCRIPT;
      script.async = true;
      document.head.appendChild(script);
    }

    function extractSeconds(data: any) {
      if (!data || typeof data !== 'object') return null;

      const keys = ['currentTime', 'time', 'seconds', 'position', 'current_time'];

      for (const key of keys) {
        if (key in data && isFinite(Number(data[key]))) {
          return Number(data[key]);
        }
      }

      if (data.payload && typeof data.payload === 'object') {
        for (const key of keys) {
          if (key in data.payload && isFinite(Number(data.payload[key]))) {
            return Number(data.payload[key]);
          }
        }
      }

      return null;
    }

    function onMessage(event: MessageEvent) {
      try {
        const data =
          typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

        const seconds = extractSeconds(data);

        if (seconds !== null) {
          localStorage.setItem(storageKey, String(Math.floor(seconds)));

          if (seconds >= REVEAL_AT_SECONDS) {
            setShowCta(true);
          }
        }
      } catch {}
    }

    window.addEventListener('message', onMessage);

    const fallback = setTimeout(() => {
      let elapsed = savedProgress;

      const interval = setInterval(() => {
        const alreadyUnlocked =
          Number(localStorage.getItem(storageKey) || 0) >= REVEAL_AT_SECONDS;

        if (alreadyUnlocked) {
          setShowCta(true);
          clearInterval(interval);
          return;
        }

        elapsed += 1;
        localStorage.setItem(storageKey, String(elapsed));

        if (elapsed >= REVEAL_AT_SECONDS) {
          setShowCta(true);
          clearInterval(interval);
        }
      }, 1000);
    }, 5000);

    return () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(fallback);
    };
  }, []);

  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    WHATSAPP_MESSAGE
  )}`;

  return (
    <main className="min-h-screen bg-[#07111f] text-white">
      <section className="mx-auto flex max-w-3xl flex-col items-center px-4 py-8 text-center">
        <div className="mb-4 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-100">
          Goiânia
        </div>

        <h1 className="mb-4 text-3xl font-extrabold leading-tight md:text-5xl">
          
        </h1>

        <p className="mb-7 max-w-2xl text-base leading-relaxed text-slate-300 md:text-lg">
         
        </p>

        <div className="w-full overflow-hidden rounded-2xl bg-black shadow-2xl">
          <div className="relative w-full pt-[177.7777%]">
            <div
              className="absolute inset-0 flex items-center justify-center"
              dangerouslySetInnerHTML={{
                __html: `
                  <vturb-smartplayer
                    id="vid-${VIDEO_ID}"
                    style="display:block;margin:0 auto;width:100%;height:100%;max-width:400px;"
                  ></vturb-smartplayer>
                `,
              }}
            />
          </div>
        </div>

        {showCta ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 rounded-full bg-green-500 px-8 py-4 text-base font-extrabold text-white shadow-xl transition hover:bg-green-400 md:text-lg"
          >
            QUERO CONHECER A OPORTUNIDADE
          </a>
        ) : (
          <p className="mt-5 text-sm text-slate-400">
            
          </p>
        )}

        <p className="mt-8 text-xs text-slate-500">
          Flyimob • Expansão imobiliária
        </p>
      </section>
    </main>
  );
}