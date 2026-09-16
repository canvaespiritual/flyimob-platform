'use client';

import {
  createElement,
  FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import Image from 'next/image';
import Script from 'next/script';
import styles from './academy.module.css';

const FUNNEL = 'corretor-academy';
const VSL = 'corretor-academy-v1';
const VIDEO = '6aa950430492aa379514a80b';
const PITCH = 2034;

const SCRIPT =
  'https://scripts.converteai.net/ab0d5dbd-353e-4147-a5c6-52ab96121828/players/6aa950430492aa379514a80b/v4/player.js';

const CHECKOUT =
  'https://pay.hotmart.com/C13699064X?off=a2itt7gi&offDiscount=PONTE';

declare global {
  interface Window {
    smartplayer?: {
      instances?: Array<{
        on: (
          event: string,
          cb: (...args: unknown[]) => void
        ) => void;
        video?: {
          currentTime?: number;
        };
      }>;
    };
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

function ga(
  event: string,
  params: Record<string, unknown> = {}
) {
  window.gtag?.('event', event, params);
}

type Session = {
  collectorToken: string;
  sessionId: string;
  pitchReachedAt?: string | null;
};

function queryAttribution() {
  const p = new URLSearchParams(window.location.search);

  const value = (key: string) => p.get(key) || null;

  return {
    source: value('source'),
    utmSource: value('utm_source'),
    utmMedium: value('utm_medium'),
    utmCampaign: value('utm_campaign'),
    utmContent: value('utm_content'),
    utmTerm: value('utm_term'),
    utmId: value('utm_id'),
    fbclid: value('fbclid'),
    fbp:
      value('fbp') ||
      document.cookie.match(/(?:^|; )_fbp=([^;]+)/)?.[1] ||
      null,
    fbc:
      value('fbc') ||
      document.cookie.match(/(?:^|; )_fbc=([^;]+)/)?.[1] ||
      null,
    gclid: value('gclid'),
    wbraid: value('wbraid'),
    gbraid: value('gbraid'),
    campaignId: value('campaignId'),
    adsetId: value('adsetId'),
    adId: value('adId'),
    landingPage: window.location.href,
    referrer: document.referrer || null,
  };
}

function getPresentationDate() {
  const now = new Date();

  const weekday = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    timeZone: 'America/Sao_Paulo',
  }).format(now);

  const date = new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Sao_Paulo',
  }).format(now);

  return {
    weekday,
    date,
    full: `${weekday}, ${date}`,
  };
}

export default function CorretorAcademyPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [pitch, setPitch] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [lead, setLead] = useState({
    name: '',
    email: '',
    phone: '',
  });

  const [message, setMessage] = useState('');
  const [presentationDate, setPresentationDate] =
    useState<{ weekday: string; date: string; full: string } | null>(null);

  const seq = useRef(0);
  const lastSecond = useRef(0);
  const queue = useRef<Array<Record<string, unknown>>>([]);
  const flushTimer = useRef<number | null>(null);
  const wired = useRef(false);
  const pitchReached = useRef(false);

  useEffect(() => {
    setPresentationDate(getPresentationDate());

    ga('page_view', {
      page_location: window.location.href,
    });

    window.fbq?.('track', 'PageView');

    let active = true;

    fetch('/api/academy/sessions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        funnelKey: FUNNEL,
        vslKey: VSL,
        videoId: VIDEO,
        attribution: queryAttribution(),
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (active && data.ok) {
          setSession(data);

          pitchReached.current = Boolean(
            data.pitchReachedAt
          );

          setPitch(pitchReached.current);
        }
      });

    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    document.body.appendChild(script);

    return () => {
      active = false;
      script.remove();

      if (flushTimer.current !== null) {
        window.clearTimeout(flushTimer.current);
      }
    };
  }, []);

  function enqueue(
    type: string,
    position: number | null,
    ranges: unknown[] = [],
    metadata: Record<string, unknown> = {}
  ) {
    if (!session) return;

    queue.current.push({
      eventKey: `${type.toLowerCase()}-${Date.now()}-${seq.current}`,
      sequence: seq.current++,
      type,
      clientAt: new Date().toISOString(),
      positionSecond: position,
      metadata,
      ranges,
    });

    if (flushTimer.current === null) {
      flushTimer.current = window.setTimeout(() => {
        flushTimer.current = null;
        void flush();
      }, 1000);
    }
  }

  async function flush() {
    flushTimer.current = null;

    if (!session || !queue.current.length) return;

    const events = queue.current.splice(0);

    await fetch('/api/academy/events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${session.collectorToken}`,
      },
      body: JSON.stringify({ events }),
    });
  }

  useEffect(() => {
    if (!session) return;

    const onReady = () => {
      const player =
        window.smartplayer?.instances?.[0];

      if (!player || wired.current) return;

      wired.current = true;

      enqueue(
        'PLAYER_READY',
        player.video?.currentTime ?? 0
      );

      ga('video_start', {
        video_id: VIDEO,
      });

      player.on('timeupdate', () => {
        const second = Math.floor(
          player.video?.currentTime ?? 0
        );

        if (second === lastSecond.current) return;

        const previous = lastSecond.current;
        lastSecond.current = second;

        const range =
          second > previous && second - previous <= 10
            ? [
                {
                  rangeKey: `r-${previous}-${second}-${Date.now()}`,
                  startMs: previous * 1000,
                  endMs: second * 1000,
                  observedStartAt: new Date(
                    Date.now() - 1000
                  ).toISOString(),
                  observedEndAt:
                    new Date().toISOString(),
                },
              ]
            : [];

        enqueue('PROGRESS', second, range);

        if (
          !pitchReached.current &&
          second >= PITCH
        ) {
          pitchReached.current = true;
          setPitch(true);
          enqueue('PITCH_REACHED', second);
        }
      });
    };

    document.addEventListener(
      'player:ready',
      onReady
    );

    const timer =
      window.setInterval(onReady, 1000);

    return () => {
      document.removeEventListener(
        'player:ready',
        onReady
      );

      window.clearInterval(timer);
    };
  }, [session, pitch]);

  function openCheckout() {
    setCheckoutOpen(true);

    enqueue(
      'CHECKOUT_OPEN',
      lastSecond.current
    );

    ga('begin_checkout');

    window.fbq?.(
      'track',
      'InitiateCheckout'
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();

    if (!session) return;

    const response = await fetch(
      '/api/academy/precheckout',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.collectorToken}`,
        },
        body: JSON.stringify(lead),
      }
    );

    if (!response.ok) {
      setMessage(
        'Confira seus dados e tente novamente.'
      );
      return;
    }

    ga('generate_lead');

    window.fbq?.('track', 'Lead');

    enqueue(
      'CHECKOUT_CLICK',
      lastSecond.current
    );

    await flush();

    window.location.assign(CHECKOUT);
  }

  return (
    <>
      <Script
        id="academy-meta"
        strategy="afterInteractive"
      >
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','2054561458829978');`}
      </Script>

      <Script
        id="academy-ga"
        strategy="afterInteractive"
        src="https://www.googletagmanager.com/gtag/js?id=G-7VVP8LD2KF"
      />

      <Script
        id="academy-ga-init"
        strategy="afterInteractive"
      >
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-7VVP8LD2KF');`}
      </Script>

      <main className={styles.page}>
        <div className={styles.ambientGlow} />

        <div className={styles.container}>
          <header className={styles.hero}>
            <div className={styles.liveBadge}>
              <span
                className={styles.liveDot}
              />
              APRESENTAÇÃO DISPONÍVEL
            </div>

            <h1 className={styles.headline}>
              Entenda toda a lógica do{' '}
              <span>
                mercado imobiliário
              </span>
            </h1>

            <p className={styles.subheadline}>
              Do primeiro cliente à venda:
              entenda como esse mercado
              realmente funciona.
            </p>

            {presentationDate && (
              <div
                className={
                  styles.presentationInfo
                }
              >
                <p>
                  Apresentação disponível nesta{' '}
                  <strong>
                    {presentationDate.full}
                  </strong>
                </p>

                <div
                  className={
                    styles.passwordMessage
                  }
                >
                  <span>🔒</span>
                  <span>
                    Sua senha de acesso será
                    liberada ao final da
                    apresentação.
                  </span>
                </div>
              </div>
            )}
          </header>

          <section
            className={styles.videoSection}
          >
            <div
              className={styles.videoFrame}
            >
              {createElement(
                'vturb-smartplayer',
                {
                  id: `vid-${VIDEO}`,
                  style: {
                    display: 'block',
                    margin: '0 auto',
                    width: '100%',
                    maxWidth: 400,
                  },
                },
                <div
                  className="vturb-player-placeholder"
                  style={{
                    position: 'relative',
                    width: '100%',
                    padding:
                      '177.7778% 0 0',
                    backgroundColor:
                      'black',
                  }}
                />
              )}
            </div>
          </section>

          <section
            className={styles.authority}
          >
            <div
              className={
                styles.authorityDivider
              }
            />

            <div
              className={
                styles.authorityContent
              }
            >
              <div
                className={
                  styles.authorityPhotoWrap
                }
              >
                <Image
                  src="/corretor-academy/gustavo-prado.jpg"
                  alt="Gustavo Prado"
                  width={112}
                  height={112}
                  className={
                    styles.authorityPhoto
                  }
                  priority
                />
              </div>

              <div
                className={
                  styles.authorityText
                }
              >
                <p
                  className={
                    styles.presentedBy
                  }
                >
                  Apresentado por
                </p>

                <h2>Gustavo Prado</h2>

                <p
                  className={
                    styles.authorityRole
                  }
                >
                  Empresário do mercado
                  imobiliário
                </p>

                <div
                  className={
                    styles.authorityStats
                  }
                >
                  <span>
                    <strong>
                      15 anos
                    </strong>{' '}
                    de mercado
                  </span>

                  <span>
                    <strong>
                      + R$ 250 milhões
                    </strong>{' '}
                    em negócios realizados
                  </span>

                  <span>
                    <strong>
                      + 1.400 sonhos
                      realizados
                    </strong>{' '}
                    com apartamentos
                    vendidos a clientes
                    finais
                  </span>

                  <span>
                    <strong>
                      Milhares de alunos
                    </strong>{' '}
                    treinados ao longo
                    dessa trajetória
                  </span>
                </div>
              </div>
            </div>
          </section>

          {pitch && (
            <section
              className={styles.offer}
            >
              <div
                className={
                  styles.unlockedBadge
                }
              >
                <span>✓</span>
                ACESSO LIBERADO
                {presentationDate &&
                  ` • ${presentationDate.date.toUpperCase()}`}
              </div>

              <h2>
                Seu desconto adicional
                ainda está disponível{' '}
                <span>hoje.</span>
              </h2>

              <p
                className={
                  styles.offerDescription
                }
              >
                Você chegou ao ponto de
                liberação da apresentação.
                Aproveite a condição
                disponível agora para
                continuar.
              </p>

              {!checkoutOpen && (
                <>
                  <button
                    type="button"
                    onClick={openCheckout}
                    className={
                      styles.primaryButton
                    }
                  >
                    QUERO ACESSAR COM
                    DESCONTO
                    <span>→</span>
                  </button>

                  <p
                    className={
                      styles.guarantee
                    }
                  >
                    Acesso imediato • 7 dias
                    de garantia
                  </p>
                </>
              )}
            </section>
          )}

          {checkoutOpen && (
            <section
              className={
                styles.checkoutSection
              }
            >
              <div
                className={
                  styles.checkoutHeader
                }
              >
                <span
                  className={
                    styles.checkoutStep
                  }
                >
                  ÚLTIMO PASSO
                </span>

                <h2>
                  Para onde devemos enviar
                  seu acesso?
                </h2>

                <p>
                  Preencha seus dados para
                  continuar para o ambiente
                  seguro de pagamento.
                </p>
              </div>

              <form
                onSubmit={submit}
                className={styles.form}
              >
                <label>
                  <span>Seu nome</span>
                  <input
                    required
                    autoComplete="name"
                    placeholder="Digite seu nome"
                    value={lead.name}
                    onChange={(e) =>
                      setLead({
                        ...lead,
                        name: e.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  <span>Melhor e-mail</span>
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    placeholder="voce@email.com"
                    value={lead.email}
                    onChange={(e) =>
                      setLead({
                        ...lead,
                        email: e.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  <span>WhatsApp</span>
                  <input
                    required
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="(00) 00000-0000"
                    value={lead.phone}
                    onChange={(e) =>
                      setLead({
                        ...lead,
                        phone: e.target.value,
                      })
                    }
                  />
                </label>

                <button
                  type="submit"
                  className={
                    styles.primaryButton
                  }
                >
                  CONTINUAR PARA O
                  PAGAMENTO
                  <span>→</span>
                </button>

                <div
                  className={
                    styles.secureCheckout
                  }
                >
                  <span>🔒</span>
                  Você será direcionado ao
                  checkout seguro da
                  Hotmart.
                </div>

                {message && (
                  <p
                    className={
                      styles.formMessage
                    }
                  >
                    {message}
                  </p>
                )}
              </form>
            </section>
          )}

          <footer className={styles.footer}>
            © {new Date().getFullYear()} Flyimob
          </footer>
        </div>
      </main>
    </>
  );
}