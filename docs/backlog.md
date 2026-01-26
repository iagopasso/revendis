# Backlog Prioritario (MVP e Fases)

## Inventario
- EPIC: Cadastro e variacoes
  - HIST [MVP]: Cadastrar produto com SKU/variacao e codigo de barras
    - CA: SKU unico; nome/preco/estoque inicial obrigatorios; erro em duplicado
  - HIST [MVP]: Importar produtos via CSV
    - CA: valida colunas; reporta erros; cria/atualiza em lote
- EPIC: Movimentacao e ajuste
  - HIST [MVP]: Ajustar estoque (entrada/saida) com motivo
    - CA: motivo obrigatorio; gera log de auditoria; atualiza por loja
  - HIST [MVP]: Transferir estoque entre lojas
    - CA: debita origem/credita destino; gera comprovante
- EPIC: Devolucoes
  - HIST [MVP]: Registrar devolucao total/parcial
    - CA: seleciona itens/quantidades; estorna recebivel; estoque retorna (ou avariado)
- EPIC: Sincronizacao
  - HIST [MVP]: Sincronizar estoque multi-dispositivo
    - CA: fila offline; conflito resolvido por regra (timestamp + tipo de movimento)

## Vendas / PDV
- EPIC: Checkout rapido
  - HIST [MVP]: Adicionar item por codigo de barras ou busca rapida
    - CA: adiciona em < 1s; subtotal atualizado; suporta quantidade
  - HIST [MVP]: Finalizar venda com desconto
    - CA: aplica desconto; calcula total; emite recibo
  - HIST [MVP]: Pagamento multiplo (dinheiro/PIX/cartao)
    - CA: soma pagamentos = total; calcula troco
- EPIC: Offline-first
  - HIST [MVP]: Vender offline com fila de sincronizacao
    - CA: venda fica pendente; sincroniza sem duplicidade
- EPIC: Cancelamento/estorno
  - HIST [MVP]: Cancelar venda
    - CA: reverte estoque e recebiveis; registra auditoria

## Clientes
- EPIC: Cadastro basico
  - HIST [MVP]: Criar cliente com contato
    - CA: nome e telefone validos; deduplicacao por telefone
  - HIST [F+1]: Historico de compras
    - CA: lista ultimas compras e ticket medio

## Financas (Recebiveis)
- EPIC: Registro e conciliacao
  - HIST [MVP]: Gerar recebivel automatico na venda
    - CA: status pendente; data prevista; forma de pagamento
  - HIST [MVP]: Conciliar pagamento (total/parcial)
    - CA: altera status; registra data/valor; suporta parcial
  - HIST [MVP]: Lista de vencidos (aging)
    - CA: filtra por vencimento e loja
- EPIC: Integracoes de pagamento
  - HIST [F+1]: Integração com gateway e split
    - CA: webhook atualiza recebivel automaticamente

## Relatorios
- EPIC: Basicos
  - HIST [MVP]: Vendas diarias por loja
    - CA: filtro por data; exportacao CSV
  - HIST [MVP]: Rupturas de estoque
    - CA: alerta produtos abaixo do minimo
  - HIST [MVP]: Recebiveis por vencimento
    - CA: totais por status (pendente/pago/atrasado)
- EPIC: Avancados
  - HIST [F+1]: Margem por categoria
    - CA: considera custo medio e descontos

## Loja Virtual
- EPIC: Catalogo e sincronizacao
  - HIST [MVP]: Publicar produto no catalogo
    - CA: visivel em ate 5 min; preco e estoque corretos
  - HIST [MVP]: Sincronizar estoque com pedidos online
    - CA: baixa estoque ao confirmar pagamento
- EPIC: Checkout simples
  - HIST [MVP]: Carrinho com frete e pagamento
    - CA: calcula frete; confirma pagamento via gateway
- EPIC: Pedidos
  - HIST [MVP]: Receber pedido e atualizar status
    - CA: confirma, separa, envia; notifica cliente
- EPIC: Integracoes
  - HIST [F+1]: Marketplace/omnicanal
    - CA: recebe pedidos e atualiza estoque

## Priorizacao
- MVP: Inventario, Vendas/PDV, Recebiveis, Loja Virtual basica, Relatorios basicos.
- Fase +1: Relatorios avancados, CRM leve, integracoes de pagamento.
- Fase +2: Marketplace, fiscal/NF-e, recomendacoes.
