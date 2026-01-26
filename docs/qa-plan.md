# Plano de Testes

## Automatizados
- Unitarios: regras de estoque, calculo de recebiveis.
- Integracao: endpoints criticos (PDV, inventario).
- Contratos: webhooks e API publica.
- E2E: fluxo PDV, devolucao, checkout web.
- Performance: checkout P95 < 500 ms.

## Manuais
- Exploratorio: offline, conflito de sync, devolucoes parciais.
- UAT: 5-10 revendedores reais.

## Checklist de Regressao
- Venda com desconto.
- Devolucao total e parcial.
- Ajuste de estoque por motivo.
- Conciliacao de recebiveis.
- Publicacao de produto no catalogo.
