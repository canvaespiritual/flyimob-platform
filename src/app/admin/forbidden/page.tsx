export default function ForbiddenPage() {
  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Acesso negado</h1>
      <p className="text-sm text-gray-600 mt-2">
        Seu usuário não tem permissão para acessar esta área.
      </p>
    </div>
  );
}
