# Exemplo de DNS e Proxy para Loja por Subdominio

Objetivo: publicar a vitrine por subdominio, por exemplo `minhaloja.seuestoque.com.br`, redirecionando para a rota interna do Next.js (`/loja/[subdomain]`).

## 1) DNS (Cloudflare ou similar)

Crie os registros:

1. `A` raiz
   - `@` -> `SEU_IP_PUBLICO`
2. `A` wildcard
   - `*` -> `SEU_IP_PUBLICO`
3. `A` (ou `CNAME`) para API
   - `api` -> `SEU_IP_PUBLICO` (ou host do backend)

Se usar Cloudflare, deixe o proxy habilitado (nuvem laranja) para `@`, `*` e `api`.

## 2) Proxy (Nginx)

Este bloco:
- aceita qualquer subdominio `*.seuestoque.com.br`
- transforma `https://slug.seuestoque.com.br/` em `http://127.0.0.1:3000/loja/slug`
- preserva assets do Next (`/_next/*`)

```nginx
# redireciona HTTP -> HTTPS
server {
  listen 80;
  server_name .seuestoque.com.br;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name ~^(?<store_slug>[a-z0-9-]+)\.seuestoque\.com\.br$;

  # SSL (exemplo com Let's Encrypt wildcard)
  # ssl_certificate     /etc/letsencrypt/live/seuestoque.com.br/fullchain.pem;
  # ssl_certificate_key /etc/letsencrypt/live/seuestoque.com.br/privkey.pem;

  # Next static files
  location /_next/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # Home do subdominio -> /loja/<slug>
  location = / {
    proxy_pass http://127.0.0.1:3000/loja/$store_slug$is_args$args;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # Demais rotas do app
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## 3) Variaveis do frontend/backend

No web:

```bash
NEXT_PUBLIC_API_URL=https://api.seuestoque.com.br/api
```

No backend:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/revendis
```

## 4) Checklist rapido

1. No painel, salve `subdomain = revendis`.
2. Acesse `https://revendis.seuestoque.com.br`.
3. Confirme filtros e regras de estoque aplicadas na vitrine publica.
