import { Router } from 'express';
import customers from './customers';
import finance from './finance';
import health from './health';
import inventory from './inventory';
import reports from './reports';
import sales from './sales';
import storefront from './storefront';

const router = Router();

router.use(health);
router.use(customers);
router.use(finance);
router.use(inventory);
router.use(reports);
router.use(sales);
router.use(storefront);

export default router;
