import { Router } from 'express';
import { scanTicket, getEventCheckins } from '../controllers/ticketController.js';
import { auth, requireRole } from '../middleware/auth.js';

const router = Router();

router.post('/scan', auth, requireRole('gate_agent', 'admin'), scanTicket);
router.get('/checkins/:eventId', auth, requireRole('gate_agent', 'admin'), getEventCheckins);

export default router;
