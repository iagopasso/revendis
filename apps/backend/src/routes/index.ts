import { Router } from 'express';
import brands from './brands';
import customers from './customers';
import finance from './finance';
import health from './health';
import inventory from './inventory';
import purchases from './purchases';
import reports from './reports';
import sales from './sales';
import settings from './settings';
import storefront from './storefront';

const router = Router();

router.use(health);
router.use(brands);
router.use(customers);
router.use(finance);
router.use(inventory);
router.use(purchases);
router.use(reports);
router.use(sales);
router.use(settings);
router.use(storefront);

export default router;
