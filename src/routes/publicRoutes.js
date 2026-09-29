import { Router } from 'express';
import {
  listEvents,
  getEvent,
  listCharacters,
  getCharacter,
  getHomeContent,
  submitContactMessage,
} from '../controllers/publicController.js';
import { getMedia } from '../controllers/uploadController.js';
import { getPublicSeatMap, holdPublicSeats } from '../controllers/seatMapController.js';
import { contactLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.get('/events', listEvents);
router.get('/events/:slug', getEvent);
router.get('/events/:eventId/seatmap', getPublicSeatMap);
router.post('/events/:eventId/seats/hold', holdPublicSeats);
router.get('/characters', listCharacters);
router.get('/characters/:slug', getCharacter);
router.get('/content/home', getHomeContent);
router.post('/contact', contactLimiter, submitContactMessage);
router.get('/media/:id', getMedia);

export default router;
