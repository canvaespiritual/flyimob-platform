'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    _fbq?: any;
  }
}

const VIDEO_ID = '6a2ac830c7a04b5a3db0ea11';
const VTURB_SCRIPT =
  'https://scripts.converteai.net/ab0d5dbd-353e-4147-a5c6-52ab96121828/players/6a2ac830c7a04b5a3db0ea11/v4/player.js';

const META_PIXEL_ID = '2054561458829978';

const CITY = 'rio_de_janeiro';
const CAMPAIGN_REF = 'RH-RJ';
const FUNNEL = 'recrutamento';
const REVEAL_AT_SECONDS = 1880;

const WATCH_MARKS = [30, 90, 180, 360, 600, 900, 1200, REVEAL_AT_SECONDS];

const WHATSAPP_NUMBER = '5521971592969';
const WHATSAPP_MESSAGE = '[RH-GO] SENHA: PONTE';

export default function OportunidadePage() {
  useEffect(() => {
    const storageKey = `vturb_progress_${VIDEO_ID}`;
    const firedMarksKey = `vturb_marks_fired_${VIDEO_ID}_${CAMPAIGN_REF}`;

    function fireMeta(eventName: string, params: Record<string, any> = {}) {
      if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
        window.fbq(eventName === 'Lead' ? 'track' : 'trackCustom', eventName, {
          city: CITY,
          ref: CAMPAIGN_REF,
          funnel: FUNNEL,
          video_id: VIDEO_ID,
          ...params,
        });
      }
    }

    function setupMetaPixel() {
      if (!META_PIXEL_ID) return;

      if (!window.fbq) {
        const fbq = function (...args: any[]) {
          // @ts-ignore
          fbq.callMethod ? fbq.callMethod.apply(fbq, args) : fbq.queue.push(args);
        } as any;

        window.fbq = fbq;
        window._fbq = fbq;
        fbq.push = fbq;
        fbq.loaded = true;
        fbq.version = '2.0';
        fbq.queue = [];

        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://connect.facebook.net/en_US/fbevents.js';
        document.head.appendChild(script);
      }

      const fbq = window.fbq;

      if (typeof fbq !== 'function') return;

      fbq('init', META_PIXEL_ID);
      fbq('track', 'PageView');
      fbq('track', 'ViewContent', {
        content_name: 'VSL Recrutamento Rio de Janeiro',
        content_category: 'rh_recrutamento',
        city: CITY,
        ref: CAMPAIGN_REF,
        funnel: FUNNEL,
        video_id: VIDEO_ID,
      });
    }

    function getFiredMarks(): number[] {
      try {
        return JSON.parse(localStorage.getItem(firedMarksKey) || '[]');
      } catch {
        return [];
      }
    }

    function setFiredMarks(marks: number[]) {
      try {
        localStorage.setItem(firedMarksKey, JSON.stringify(marks));
      } catch {}
    }

    function fireWatchMarks(seconds: number) {
      const fired = new Set(getFiredMarks());

      for (const mark of WATCH_MARKS) {
        if (seconds >= mark && !fired.has(mark)) {
          const eventName =
            mark === REVEAL_AT_SECONDS ? 'VideoWatch_CTA' : `VideoWatch_${mark}s`;

          fireMeta(eventName, {
            seconds: Math.floor(seconds),
            watch_mark: mark,
          });

          fired.add(mark);
        }
      }

      setFiredMarks(Array.from(fired));
    }

    function revealCta() {
      const cta = document.getElementById('ctaBox');
      if (cta) cta.classList.remove('hidden');
    }

    setupMetaPixel();

    const savedProgress = Number(localStorage.getItem(storageKey) || 0);

    if (savedProgress >= REVEAL_AT_SECONDS) {
      revealCta();
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
          fireWatchMarks(seconds);

          if (seconds >= REVEAL_AT_SECONDS) {
            revealCta();
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
          revealCta();
          clearInterval(interval);
          return;
        }

        elapsed += 1;
        localStorage.setItem(storageKey, String(elapsed));
        fireWatchMarks(elapsed);

        if (elapsed >= REVEAL_AT_SECONDS) {
          revealCta();
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

  function handleWhatsappClick() {
    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      window.fbq('track', 'Lead', {
        content_name: 'Clique WhatsApp - Recrutamento Rio de Janeiro',
        content_category: 'rh_recrutamento',
        city: CITY,
        ref: CAMPAIGN_REF,
        funnel: FUNNEL,
        video_id: VIDEO_ID,
      });
    }
  }

  return (
    <main className="min-h-screen bg-[#07111f] text-white">
      <section className="mx-auto flex max-w-3xl flex-col items-center px-4 py-8 text-center">
        <div className="mb-4 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-100">
          Rio de Janeiro
        </div>

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

        <div id="ctaBox" className="hidden">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleWhatsappClick}
            className="mt-8 inline-block rounded-full bg-green-500 px-8 py-4 text-base font-extrabold text-white shadow-xl transition hover:bg-green-400 md:text-lg"
          >
            QUERO CONHECER A OPORTUNIDADE
          </a>
        </div>

        <p className="mt-8 text-xs text-slate-500">
          Flyimob • Expansão imobiliária
        </p>
      </section>
    </main>
  );
}