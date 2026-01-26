import { Router } from 'express';

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

export default router;
