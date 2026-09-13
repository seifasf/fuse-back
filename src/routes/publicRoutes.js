import { Router } from 'express';
import {
  listEvents,
  getEvent,
  listCharacters,
  getCharacter,
  getHomeContent,
} from '../controllers/publicController.js';
import { getMedia } from '../controllers/uploadController.js';

const router = Router();

router.get('/events', listEvents);
router.get('/events/:slug', getEvent);
router.get('/characters', listCharacters);
router.get('/characters/:slug', getCharacter);
router.get('/content/home', getHomeContent);
router.get('/media/:id', getMedia);

export default router;
