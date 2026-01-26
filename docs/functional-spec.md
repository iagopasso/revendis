# Especificacao Funcional + Matriz de Paridade

## Escopo MVP
- Inventario: cadastro, variacoes, ajuste/devolucao, contagem.
- Vendas/PDV: checkout rapido, descontos, recibo, multiloja.
- Recebiveis: registro, conciliacao, status e previsao.
- Loja virtual: catalogo, carrinho, checkout simples.
- Relatorios: vendas diarias, rupturas basicas.

## Requisitos Nao Funcionais
- Offline-first com fila de sincronizacao.
- Checkout P95 < 500 ms.
- LGPD: criptografia at-rest/in-transit, trilha de auditoria.
- Multi-dispositivo com resolucao de conflitos (ultimo writer + regra por dominio).

## Matriz de Paridade (exemplo inicial)
| Funcionalidade | Concorrente A | Concorrente B | Concorrente C | Revendis MVP | Fase +1 |
| --- | --- | --- | --- | --- | --- |
| PDV rapido | Sim | Sim | Sim | Sim | - |
| Sync offline | Parcial | Sim | Nao | Sim | - |
| Recebiveis com conciliacao | Nao | Sim | Sim | Sim | - |
| Loja virtual | Sim | Parcial | Sim | Sim | - |
| Relatorios avancados | Sim | Sim | Sim | Nao | Sim |

## Observacoes
- Preencher concorrentes e validar paridade com 5-7 revendedores.
- Documentar fluxos de borda (devolucao, ajustes, chargeback).
