import { Router } from 'express';
import { DEFAULT_STORE_ID } from '../config';
import { query } from '../db';

const router = Router();

const toDateInput = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return '';
};

const normalizeDateInput = (value: unknown) => {
  const input = toDateInput(value).trim();
  if (!input) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const parsed = new Date(`${input}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return input;
};

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const resolveRangeDates = (fromValue: unknown, toValue: unknown) => {
  const fromInput = normalizeDateInput(fromValue);
  const toInput = normalizeDateInput(toValue);

  if (!fromInput && !toInput) {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 27);
    return {
      from: toIsoDate(from),
      to: toIsoDate(today)
    };
  }

  if (fromInput && toInput && fromInput > toInput) {
    return { from: toInput, to: fromInput };
  }

  return {
    from: fromInput,
    to: toInput
  };
};

router.get('/reports/daily-sales', (_req, res) => {
  res.json({ data: [], meta: { message: 'Daily sales report (stub)' } });
});

router.get('/reports/stock-outs', (_req, res) => {
  res.json({ data: [], meta: { message: 'Stock-out report (stub)' } });
});

router.get('/reports/receivables-aging', (_req, res) => {
  res.json({ data: [], meta: { message: 'Receivables aging report (stub)' } });
});

router.get('/reports/top-products', async (req, res, next) => {
  try {
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const { from, to } = resolveRangeDates(req.query.from, req.query.to);
    const result = await query(
      `SELECT COALESCE(p.name, si.sku) AS product_name,
              si.sku,
              COALESCE(MAX(p.brand), 'Sem marca') AS brand,
              COALESCE(SUM(si.quantity), 0) AS sold_qty,
              COALESCE(SUM(si.quantity * si.price), 0) AS sold_total,
              MAX(s.created_at) AS last_sale_at
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       LEFT JOIN products p ON p.id = si.product_id
       WHERE s.store_id = $1
         AND ($2::date IS NULL OR s.created_at::date >= $2::date)
         AND ($3::date IS NULL OR s.created_at::date <= $3::date)
       GROUP BY COALESCE(p.name, si.sku), si.sku
       ORDER BY sold_qty DESC, sold_total DESC
       LIMIT 50`,
      [storeId, from, to]
    );

    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get('/reports/top-customers', async (req, res, next) => {
  try {
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const { from, to } = resolveRangeDates(req.query.from, req.query.to);
    const result = await query(
      `WITH sales_base AS (
         SELECT s.id,
                s.customer_id,
                COALESCE(c.name, s.customer_name, 'Cliente nao informado') AS customer_name,
                COALESCE(c.phone, '-') AS customer_phone,
                s.total,
                s.created_at
         FROM sales s
         LEFT JOIN customers c ON c.id = s.customer_id
         WHERE s.store_id = $1
           AND ($2::date IS NULL OR s.created_at::date >= $2::date)
           AND ($3::date IS NULL OR s.created_at::date <= $3::date)
       ),
       paid_per_sale AS (
         SELECT sb.id AS sale_id,
                LEAST(
                  sb.total,
                  GREATEST(COALESCE(pay.total_paid, 0), COALESCE(rcv.total_paid, 0))
                ) AS paid_total
         FROM sales_base sb
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(p.amount), 0) AS total_paid
           FROM payments p
           WHERE p.sale_id = sb.id
         ) pay ON true
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(r.amount), 0) AS total_paid
           FROM receivables r
           WHERE r.sale_id = sb.id AND r.status = 'paid'
         ) rcv ON true
       )
       SELECT sb.customer_name,
              sb.customer_phone,
              COUNT(*)::int AS orders_count,
              COALESCE(SUM(sb.total), 0) AS total_spent,
              COALESCE(SUM(p.paid_total), 0) AS total_paid,
              MAX(sb.created_at) AS last_sale_at
       FROM sales_base sb
       LEFT JOIN paid_per_sale p ON p.sale_id = sb.id
       GROUP BY sb.customer_name, sb.customer_phone
       ORDER BY total_spent DESC, total_paid DESC
       LIMIT 50`,
      [storeId, from, to]
    );

    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

export default router;
