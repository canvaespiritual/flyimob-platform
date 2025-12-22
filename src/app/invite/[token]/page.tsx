// src/app/invite/[token]/page.tsx

type Props = {
  params: { token: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function InviteTokenPage({ params }: Props) {
  return (
    <div style={{ padding: 24 }}>
      <h1>Convite</h1>
      <p>Token: <code>{params.token}</code></p>
      <p>Próximo passo: aqui vai a tela de definir senha / aceitar convite.</p>
    </div>
  );
}
