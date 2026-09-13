import { Router } from 'express';
import { getOverview, getEventAnalytics, exportEventCsv } from '../controllers/analyticsController.js';
import { auth, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(auth, requireRole('admin'));

router.get('/overview', getOverview);
router.get('/events/:id', getEventAnalytics);
router.get('/events/:id/export', exportEventCsv);

export default router;
