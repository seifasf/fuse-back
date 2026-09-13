import { Router } from 'express';
import { register, login, logout, me, verifyAdminKey } from '../controllers/authController.js';
import { auth } from '../middleware/auth.js';
import { loginLimiter, adminKeyLimiter, registerLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/verify-admin-key', adminKeyLimiter, verifyAdminKey);
router.post('/logout', logout);
router.get('/me', auth, me);

export default router;
