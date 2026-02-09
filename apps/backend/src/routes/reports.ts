import { Router } from 'express';
import { DEFAULT_STORE_ID } from '../config';
import { query } from '../db';

const router = Router();

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
    const result = await query(
      `SELECT COALESCE(p.name, si.sku) AS product_name,
              si.sku,
              COALESCE(SUM(si.quantity), 0) AS sold_qty,
              COALESCE(SUM(si.quantity * si.price), 0) AS sold_total,
              MAX(s.created_at) AS last_sale_at
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       LEFT JOIN products p ON p.id = si.product_id
       WHERE s.store_id = $1
         AND s.created_at >= now() - interval '28 days'
       GROUP BY COALESCE(p.name, si.sku), si.sku
       ORDER BY sold_qty DESC, sold_total DESC
       LIMIT 50`,
      [storeId]
    );

    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get('/reports/top-customers', async (req, res, next) => {
  try {
    const storeId = req.header('x-store-id') || DEFAULT_STORE_ID;
    const result = await query(
      `SELECT COALESCE(c.name, s.customer_name, 'Cliente nao informado') AS customer_name,
              COUNT(*)::int AS orders_count,
              COALESCE(SUM(s.total), 0) AS total_spent,
              MAX(s.created_at) AS last_sale_at
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.store_id = $1
         AND s.created_at >= now() - interval '28 days'
       GROUP BY COALESCE(c.name, s.customer_name, 'Cliente nao informado')
       ORDER BY total_spent DESC
       LIMIT 50`,
      [storeId]
    );

    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

export default router;
