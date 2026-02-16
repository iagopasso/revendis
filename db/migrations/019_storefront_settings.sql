ALTER TABLE organization_settings
  ADD COLUMN IF NOT EXISTS storefront_subdomain text,
  ADD COLUMN IF NOT EXISTS storefront_color text NOT NULL DEFAULT '#7D58D4',
  ADD COLUMN IF NOT EXISTS storefront_only_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS storefront_show_out_of_stock boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS storefront_filter_category boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS storefront_filter_brand boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS storefront_filter_price boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS storefront_whatsapp text,
  ADD COLUMN IF NOT EXISTS storefront_show_whatsapp_button boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS storefront_selected_brands text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS storefront_selected_categories text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS storefront_price_from text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS storefront_price_to text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS storefront_logo_url text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_settings_storefront_subdomain
  ON organization_settings (lower(storefront_subdomain))
  WHERE storefront_subdomain IS NOT NULL;
