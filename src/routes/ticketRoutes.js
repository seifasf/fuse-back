import { Router } from 'express';
import { scanTicket, getEventCheckins, listGateEvents } from '../controllers/ticketController.js';
import { auth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/gate/events', auth, requireRole('gate_agent', 'admin'), listGateEvents);
router.post('/scan', auth, requireRole('gate_agent', 'admin'), scanTicket);
router.get('/checkins/:eventId', auth, requireRole('gate_agent', 'admin'), getEventCheckins);

export default router;
