# Área do correspondente documental V1

A área /correspondente usa os mesmos serviços de documentos e workflow. Não há migration nem alteração de estados, storage, formatos ou inspeção de arquivos.

## Operação
- Cabeçalho com logo existente, identificação da operação/correspondente, saída e ajuda em cinco passos.
- Busca por nome ou CPF e período de cadastro, com paginação de 20 clientes no servidor. Atualizações mais recentes primeiro, com desempate por ID. Filtros seguem nas próximas páginas.
- Filas: Para analisar (AGUARDANDO_CORRESPONDENTE), Em análise (EM_ANALISE), Correções (PENDENCIA_DOCUMENTAL e EM_REANALISE), Concluídas (APROVADO, CONDICIONADO e REPROVADO). Correções diferencia cliente aguardando correção de correção recebida.
- Cards mostram CPF mascarado, corretor, documentos, correções abertas, última atualização e ações específicas.
- Cliente tem Documentos, Análise e pendências e Histórico. Navegar entre áreas preserva fila local de upload e parecer não salvo.
- Iniciar análise habilita registro de correções e conclusão, preservando visualização, download e novos anexos.
- Solicitar correção em um arquivo preenche o vínculo ao documento/pessoa/tipo. Também é possível registrar correção geral ou por categoria.
- Solicitar correções como conclusão requer correção aberta. Aprovar/condicionar/reprovar requer ausência de correções abertas. Condicionar/reprovar requer parecer. As regras continuam no servidor.
- Histórico tem eventos paginados (20), análises (10) e correções (20) em linguagem operacional. Registros técnicos permanecem imutáveis.

## Documentos
Documentos para análise usa o snapshot da análise atual, sem alterá-lo ao anexar arquivo. Documentos do correspondente usa uploadOrigin=CORRESPONDENT, já existente no modelo. Arquivos do correspondente que entraram numa análise anterior podem constar também no snapshot de uma análise posterior; o vínculo histórico é preservado.

As consultas seguem tenant/pasta/atribuição, com 30 documentos por página. Novos anexos são permitidos durante a análise. Substituição/invalidação continua restrita à janela documental já implementada. O dropdown de vínculo de correção lista até 100 arquivos do snapshot; a seleção direta na listagem de documentos funciona também além desse limite.

Preview e download seguem pelas rotas autenticadas existentes. Nenhuma URL S3/chave é entregue ao cliente. Formatos, limite, original byte a byte, SHA-256 e storage privado são preservados.

## Mensagem manual e senha inicial
O admin tem um pequeno painel após envio/reen­vio para análise. Copia cliente, quantidade atual de documentos, login, link da área e fila aplicável. Nenhum WhatsApp ou e-mail é disparado automaticamente.

Somente OWNER pode definir/redefinir senha inicial (8 a 256 caracteres, com confirmação), em POST /api/documentacoes/correspondentes/[id]/senha-inicial. A proteção de Origin continua obrigatória. Serviço e rota validam papel, tenant, correspondente ativo e updatedAt para conflito concorrente. O banco recebe somente hash scrypt; sessionVersion é incrementada para revogar sessões anteriores. Não há recuperação de senha antiga, hash em resposta, log de senha nem mensagem salva no banco.

A senha digitada compõe a mensagem imediatamente no frontend. O formulário é limpo ao concluir; refresh não recupera a senha. Se a área de transferência for bloqueada, o texto permanece apenas na tela para cópia manual e pode ser descartado com Limpar mensagem. A cópia comum sem redefinir senha orienta usar a senha existente.

## Verificação
Testes locais simulam Prisma/storage e contexto real de autenticação Next, sem banco ou S3 de produção. Cobrem busca, período, ordenação/paginação, filas/CTAs, isolamento, CPF mascarado, mensagem, hash/revogação, Origin, rotas, snapshot/origem e regressão de análise, correções, reanálise, resultados e uploads.
