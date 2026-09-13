import { Router } from 'express';
import {
  createBooking,
  confirmPayment,
  paymentWebhook,
  getMyTickets,
} from '../controllers/bookingController.js';
import { auth, optionalAuth } from '../middleware/auth.js';

const router = Router();

router.post('/', optionalAuth, createBooking);
router.post('/:bookingId/confirm', confirmPayment);
router.get('/mine', optionalAuth, getMyTickets);

export default router;
