import { Router } from 'express';
import { ping } from '../db';
import { asyncHandler } from '../utils/async-handler';

const router = Router();

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    await ping();
    res.json({ status: 'ok', service: 'backend', version: '0.1.0' });
  })
);

export default router;
