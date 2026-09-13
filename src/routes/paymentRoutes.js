import { Router } from 'express';
import { paymentWebhook } from '../controllers/bookingController.js';

const router = Router();

router.post('/webhook/:provider', paymentWebhook);

export default router;
