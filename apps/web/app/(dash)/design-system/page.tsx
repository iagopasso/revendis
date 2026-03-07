import {
  REVENDIS_APP_CORE_SCREENS,
  REVENDIS_COLOR_TOKENS,
  REVENDIS_COMPONENT_PRINCIPLES,
  REVENDIS_DASHBOARD_BLUEPRINT,
  REVENDIS_ECOSYSTEM_PRODUCTS,
  REVENDIS_IDENTITY_FREEZE,
  REVENDIS_PRODUCT_ACCENTS,
  REVENDIS_SPACING_SCALE,
  REVENDIS_TYPOGRAPHY_TOKENS
} from '../../lib/revendis-design-system';
import {
  IconBox,
  IconCart,
  IconDashboard,
  IconDiamond,
  IconDollar,
  IconGlobe,
  IconLock,
  IconPieChart,
  IconTag,
  IconUsers
} from '../icons';
import styles from './design-system.module.css';

const PRODUCT_ICONS = {
  'Revendis Market': IconGlobe,
  'Revendis Pay': IconDollar,
  'Revendis Analytics': IconPieChart
} as const;

const SCREEN_ICONS = {
  Dashboard: IconDashboard,
  Estoque: IconBox,
  Vendas: IconTag,
  Financeiro: IconDollar,
  Clientes: IconUsers,
  'Loja Publica': IconCart
} as const;

export default function DesignSystemPage() {
  return (
    <main className={`page-content ${styles.page}`}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.heroKicker}>Brand Freeze {REVENDIS_IDENTITY_FREEZE.version}</span>
          <h1>Revendis Design System Oficial</h1>
          <p>{REVENDIS_IDENTITY_FREEZE.brandEssence}</p>
        </div>
        <div className={styles.heroStamp}>
          <IconDiamond />
          <strong>Identidade congelada em {REVENDIS_IDENTITY_FREEZE.lockedAt}</strong>
          <span>Base unica para Web, Mobile e Loja Publica</span>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <h2>Identidade Visual Oficial</h2>
          <span>{REVENDIS_IDENTITY_FREEZE.symbolDefinition}</span>
        </header>
        <div className={styles.identityGrid}>
          <article className={styles.identityCard}>
            <h3>Regras visuais</h3>
            <ul>
              {REVENDIS_IDENTITY_FREEZE.visualRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </article>
          <article className={styles.identityCard}>
            <h3>Tom de voz</h3>
            <div className={styles.chips}>
              {REVENDIS_IDENTITY_FREEZE.toneOfVoice.map((tone) => (
                <span key={tone}>{tone}</span>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <h2>Tokens do Sistema</h2>
          <span>Cores, tipografia e espacamento oficiais para todo o ecossistema.</span>
        </header>
        <div className={styles.tokenLayout}>
          <article className={styles.tokenCard}>
            <h3>Paleta core</h3>
            <div className={styles.swatches}>
              {REVENDIS_COLOR_TOKENS.map((token) => (
                <div key={token.token} className={styles.swatchRow}>
                  <span className={styles.swatchColor} style={{ background: token.value }} aria-hidden />
                  <div>
                    <strong>{token.token}</strong>
                    <small>
                      {token.value} · {token.usage}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.tokenCard}>
            <h3>Acento por produto</h3>
            <div className={styles.swatches}>
              {REVENDIS_PRODUCT_ACCENTS.map((token) => (
                <div key={token.token} className={styles.swatchRow}>
                  <span className={styles.swatchColor} style={{ background: token.value }} aria-hidden />
                  <div>
                    <strong>{token.token}</strong>
                    <small>
                      {token.value} · {token.usage}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.tokenCard}>
            <h3>Tipografia</h3>
            <div className={styles.tokenList}>
              {REVENDIS_TYPOGRAPHY_TOKENS.map((token) => (
                <div key={token.token}>
                  <strong>{token.token}</strong>
                  <small>{token.value}</small>
                  <small>{token.usage}</small>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.tokenCard}>
            <h3>Espacamento</h3>
            <div className={styles.tokenList}>
              {REVENDIS_SPACING_SCALE.map((token) => (
                <div key={token.token}>
                  <strong>{token.token}</strong>
                  <small>{token.value}</small>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <h2>Arquitetura de Produtos</h2>
          <span>Estrutura oficial do ecossistema Revendis: Market, Pay e Analytics.</span>
        </header>
        <div className={styles.productGrid}>
          {REVENDIS_ECOSYSTEM_PRODUCTS.map((product) => {
            const Icon = PRODUCT_ICONS[product.name as keyof typeof PRODUCT_ICONS] || IconDiamond;
            return (
              <article key={product.name} className={styles.productCard}>
                <div className={styles.productHead}>
                  <span className={styles.productIcon}>
                    <Icon />
                  </span>
                  <div>
                    <h3>{product.name}</h3>
                    <p>{product.tagline}</p>
                  </div>
                </div>
                <p className={styles.productObjective}>{product.objective}</p>
                <ul>
                  {product.coreFeatures.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <div className={styles.metric}>
                  <strong>North Star</strong>
                  <span>{product.northStar}</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <h2>Dashboard da Plataforma</h2>
          <span>Blueprint inspirado em operacao real: leitura executiva, comercial e financeira.</span>
        </header>
        <div className={styles.dashboardGrid}>
          {REVENDIS_DASHBOARD_BLUEPRINT.map((block) => (
            <article key={block.block} className={styles.dashboardCard}>
              <h3>{block.block}</h3>
              <p>{block.objective}</p>
              <div className={styles.metricList}>
                {block.metrics.map((metric) => (
                  <span key={metric}>{metric}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <h2>Telas Principais do App</h2>
          <span>Mapa de telas prioritarias com objetivo de negocio e criterio de sucesso.</span>
        </header>
        <div className={styles.screensGrid}>
          {REVENDIS_APP_CORE_SCREENS.map((screen) => {
            const Icon = SCREEN_ICONS[screen.name as keyof typeof SCREEN_ICONS] || IconDiamond;
            return (
              <article key={screen.name} className={styles.screenCard}>
                <div className={styles.screenTitle}>
                  <Icon />
                  <strong>{screen.name}</strong>
                </div>
                <p>
                  <b>Publico:</b> {screen.audience}
                </p>
                <p>
                  <b>Objetivo:</b> {screen.goal}
                </p>
                <p>
                  <b>Sinal de sucesso:</b> {screen.successSignal}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.section}>
        <article className={styles.freezeBanner}>
          <div>
            <h2>Status oficial da marca</h2>
            <p>
              A identidade visual da Revendis esta congelada nesta versao. Novos modulos devem nascer a partir destes
              tokens e componentes, sem variacao paralela de estilo.
            </p>
          </div>
          <div className={styles.freezeMeta}>
            <span>
              <IconLock />
              Governance ativo
            </span>
            <small>Referencia valida para Web, Mobile e materiais comerciais.</small>
          </div>
        </article>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <h2>Principios de Componente</h2>
          <span>Checklist rapido para revisao de UI antes de entrar em producao.</span>
        </header>
        <div className={styles.principles}>
          {REVENDIS_COMPONENT_PRINCIPLES.map((principle, index) => (
            <article key={principle}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <p>{principle}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
