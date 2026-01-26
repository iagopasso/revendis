# Runbook Producao

## Deploy
- Web: deploy automatizado com CDN Cloudflare.
- Mobile: TestFlight/Play Console com rollout faseado.
- Backend: blue/green com feature flags.

## Monitoramento
- Latencia checkout, falhas de sync, erros 5xx.
- Alertas por SLO (P95, disponibilidade).

## On-call
- Plantao 24/7 com rotacao semanal.
- SLA: resposta SEV1 em 15 min.

## Incidentes
- SEV1: impacto total (checkout indisponivel).
- SEV2: degradacao parcial.
- SEV3: bug localizado.
