export type RevendisColorToken = {
  token: string;
  value: string;
  usage: string;
};

export type RevendisTypographyToken = {
  token: string;
  value: string;
  usage: string;
};

export type RevendisSpacingToken = {
  token: string;
  value: string;
};

export type RevendisProductModule = {
  name: string;
  tagline: string;
  objective: string;
  coreFeatures: string[];
  northStar: string;
};

export type RevendisDashboardBlock = {
  block: string;
  objective: string;
  metrics: string[];
};

export type RevendisAppScreen = {
  name: string;
  audience: string;
  goal: string;
  successSignal: string;
};

export const REVENDIS_IDENTITY_FREEZE = {
  version: '1.0',
  lockedAt: '2026-03-05',
  brandEssence: 'Confianca operacional para vender mais, com controle de ponta a ponta.',
  symbolDefinition:
    'Monograma R com tres planos de velocidade, bordas tecnicas e leitura forte em 24px ate outdoor.',
  visualRules: [
    'Fundo principal em base noturna azul (night).',
    'Acentos de acao em azul-ciano da logo.',
    'Verde da logo reservado para dinheiro, aprovacao e produto Market.',
    'Evitar variacoes cromaticas fora dos tokens oficiais.'
  ],
  toneOfVoice: ['Direto', 'Seguro', 'Comercial', 'Tecnico sem jargao desnecessario']
} as const;

export const REVENDIS_COLOR_TOKENS: RevendisColorToken[] = [
  { token: 'rv-night-950', value: '#091534', usage: 'App shell, fundos hero, paineis premium' },
  { token: 'rv-night-900', value: '#0e1f47', usage: 'Fundo principal dark' },
  { token: 'rv-night-700', value: '#183a78', usage: 'Cards escuros e containers secundarios' },
  { token: 'rv-sky-500', value: '#2fc7ff', usage: 'CTA principal, links de acao' },
  { token: 'rv-cyan-400', value: '#52d6ff', usage: 'Highlights de dados e graficos' },
  { token: 'rv-mint-500', value: '#8fd63d', usage: 'Receita, status pago, marca Market/Pay' },
  { token: 'rv-ink-900', value: '#10244f', usage: 'Texto principal em superficies claras' },
  { token: 'rv-ink-600', value: '#526892', usage: 'Texto secundario e meta labels' },
  { token: 'rv-cloud-100', value: '#e6efff', usage: 'Superficie clara secundaria' },
  { token: 'rv-cloud-000', value: '#f4f8ff', usage: 'Superficie clara primaria' },
  { token: 'rv-danger-500', value: '#f45b69', usage: 'Erro, cancelamento, risco' },
  { token: 'rv-warning-500', value: '#f5ad42', usage: 'Atraso, atencao, alerta operacional' }
];

export const REVENDIS_PRODUCT_ACCENTS: RevendisColorToken[] = [
  { token: 'market-accent', value: '#8fd63d', usage: 'Catalogo, loja publica, crescimento comercial' },
  { token: 'analytics-accent', value: '#2fc7ff', usage: 'Leitura executiva e insights' },
  { token: 'pay-accent', value: '#52d6ff', usage: 'Pagamento, reconciliacao e liquidacao' }
];

export const REVENDIS_TYPOGRAPHY_TOKENS: RevendisTypographyToken[] = [
  { token: 'display-xl', value: '700 3.125rem/1.08 Space Grotesk', usage: 'Hero, tela de marca, paginas de produto' },
  { token: 'display-md', value: '700 2rem/1.15 Space Grotesk', usage: 'Titulos de secao e dashboard' },
  { token: 'heading-lg', value: '600 1.5rem/1.2 Space Grotesk', usage: 'Cards principais e modais' },
  { token: 'heading-sm', value: '600 1.125rem/1.25 Space Grotesk', usage: 'Titulos de bloco e tabela' },
  { token: 'body-md', value: '400 0.9375rem/1.5 Space Grotesk', usage: 'Texto geral da plataforma' },
  { token: 'body-sm', value: '400 0.8125rem/1.45 Space Grotesk', usage: 'Meta info, hint e suporte' },
  { token: 'mono-md', value: '600 0.9375rem/1.3 Space Mono', usage: 'Valor monetario, KPI e codigo' }
];

export const REVENDIS_SPACING_SCALE: RevendisSpacingToken[] = [
  { token: 'space-2', value: '0.5rem' },
  { token: 'space-3', value: '0.75rem' },
  { token: 'space-4', value: '1rem' },
  { token: 'space-5', value: '1.25rem' },
  { token: 'space-6', value: '1.5rem' },
  { token: 'space-8', value: '2rem' },
  { token: 'space-10', value: '2.5rem' },
  { token: 'space-12', value: '3rem' }
];

export const REVENDIS_COMPONENT_PRINCIPLES = [
  'Buttons com hierarquia clara: primary, secondary, ghost.',
  'Cards com titulo, numero central e contexto acionavel.',
  'Inputs sempre com label visivel e feedback de estado.',
  'Tabelas mobile-first com modo card em breakpoints menores.',
  'Estados vazios com acao recomendada e linguagem comercial.'
] as const;

export const REVENDIS_ECOSYSTEM_PRODUCTS: RevendisProductModule[] = [
  {
    name: 'Revendis Market',
    tagline: 'Catalogo, estoque e canais de venda em uma operacao unica.',
    objective: 'Aumentar giro de produtos e conversao por canal.',
    coreFeatures: [
      'Catalogo centralizado com variacao e disponibilidade em tempo real',
      'Loja publica por subdominio com filtros e checkout',
      'Gestao de pedidos e sincronizacao de estoque'
    ],
    northStar: 'GMV mensal por loja ativa'
  },
  {
    name: 'Revendis Pay',
    tagline: 'Orquestracao de cobranca e reconciliacao para nao perder caixa.',
    objective: 'Reduzir inadimplencia e acelerar recebimento.',
    coreFeatures: [
      'Checkout com Pix e cartao',
      'Gestao de pendencias e confirmacao de pagamento',
      'Conferencia de status financeiro com trilha auditavel'
    ],
    northStar: 'Taxa de pagamento confirmado em D+0/D+1'
  },
  {
    name: 'Revendis Analytics',
    tagline: 'Visao executiva para decidir rapido e com previsibilidade.',
    objective: 'Transformar dados operacionais em decisao de crescimento.',
    coreFeatures: [
      'Painel executivo com vendas, margem, recorrencia e risco',
      'Relatorios de produtos, clientes e performance financeira',
      'Alertas acionaveis para estoque, cobranca e entrega'
    ],
    northStar: 'Tempo medio para decisao critica'
  }
];

export const REVENDIS_DASHBOARD_BLUEPRINT: RevendisDashboardBlock[] = [
  {
    block: 'Visao Executiva',
    objective: 'Resumo de negocio no primeiro olhar.',
    metrics: ['Receita liquida', 'Margem', 'Ticket medio', 'Pedidos']
  },
  {
    block: 'Pipeline Comercial',
    objective: 'Entender funil e taxa de conversao.',
    metrics: ['Visitas loja', 'Adicao ao carrinho', 'Checkout iniciado', 'Checkout pago']
  },
  {
    block: 'Saude Financeira',
    objective: 'Controlar caixa e risco de inadimplencia.',
    metrics: ['A receber', 'Atrasado', 'Recebido no dia', 'Previsao 7 dias']
  },
  {
    block: 'Operacao e Logistica',
    objective: 'Garantir SLA de entrega e disponibilidade.',
    metrics: ['Pedidos pendentes', 'Nao entregues', 'Ruptura de estoque', 'Lead time']
  },
  {
    block: 'Clientes e Retencao',
    objective: 'Medir recorrencia e valor por cliente.',
    metrics: ['Clientes ativos', 'Recorrentes 30d', 'LTV estimado', 'NPS operacional']
  }
];

export const REVENDIS_APP_CORE_SCREENS: RevendisAppScreen[] = [
  {
    name: 'Dashboard',
    audience: 'Gestor',
    goal: 'Ler saude do negocio e tomar decisao em menos de 2 minutos.',
    successSignal: 'Acao executiva iniciada sem navegar mais de 2 niveis.'
  },
  {
    name: 'Estoque',
    audience: 'Operacao',
    goal: 'Atualizar catalogo, preco e disponibilidade sem friccao.',
    successSignal: 'Cadastro/edicao concluido sem erro e com reflexo imediato.'
  },
  {
    name: 'Vendas',
    audience: 'Comercial',
    goal: 'Registrar venda e fechar pedido com alta taxa de aprovacao.',
    successSignal: 'Checkout iniciado para pago com menor abandono.'
  },
  {
    name: 'Financeiro',
    audience: 'Financeiro',
    goal: 'Controlar despesas, recebiveis e status de pagamento.',
    successSignal: 'Conciliacao diaria sem divergencia de valor/data.'
  },
  {
    name: 'Clientes',
    audience: 'Relacionamento',
    goal: 'Manter base ativa com historico e segmentacao por valor.',
    successSignal: 'Recorrencia mensal crescente por coorte.'
  },
  {
    name: 'Loja Publica',
    audience: 'Cliente final e revendedor',
    goal: 'Descobrir produto, montar carrinho e pagar com clareza.',
    successSignal: 'Conversao visita -> pedido pago com menor tempo.'
  }
];
