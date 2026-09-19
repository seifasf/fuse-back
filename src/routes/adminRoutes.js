import { Router } from 'express';
import {
  adminListEvents, adminCreateEvent, adminUpdateEvent, adminDeleteEvent,
  adminListTiers, adminCreateTier, adminUpdateTier, adminDeleteTier,
  adminListCharacters, adminCreateCharacter, adminUpdateCharacter, adminDeleteCharacter,
  adminListBookings, adminCancelBooking, adminGetBookingTickets,
  adminListAgents, adminCreateAgent, adminUpdateAgent, adminDeleteAgent,
  adminGetContent, adminUpdateContent,
  adminGetSections, adminUpdateSections, adminAddSection, adminUpdateSection, adminDeleteSection,
  adminAddBanner, adminDeleteBanner,
  adminListClients, adminIssueManualTicket,
  adminDoorEvents, adminDoorEventGuests,
  adminListContactMessages, adminGetContactMessage, adminUpdateContactMessage, adminDeleteContactMessage,
  adminListEventCategories, adminUpdateEventCategories,
} from '../controllers/adminController.js';
import { auth, requireRole } from '../middleware/auth.js';
import { uploadMiddleware, uploadImage, deleteMedia } from '../controllers/uploadController.js';

const router = Router();
router.use(auth, requireRole('admin'));

// Uploads
router.post('/upload', uploadMiddleware, uploadImage);
router.delete('/media/:id', deleteMedia);

// Events
router.get('/events', adminListEvents);
router.post('/events', adminCreateEvent);
router.put('/events/:id', adminUpdateEvent);
router.delete('/events/:id', adminDeleteEvent);
router.get('/event-categories', adminListEventCategories);
router.put('/event-categories', adminUpdateEventCategories);

// Tiers
router.get('/events/:eventId/tiers', adminListTiers);
router.post('/events/:eventId/tiers', adminCreateTier);
router.put('/events/:eventId/tiers/:tierId', adminUpdateTier);
router.delete('/events/:eventId/tiers/:tierId', adminDeleteTier);

// Characters
router.get('/characters', adminListCharacters);
router.post('/characters', adminCreateCharacter);
router.put('/characters/:id', adminUpdateCharacter);
router.delete('/characters/:id', adminDeleteCharacter);

// Bookings
router.get('/bookings', adminListBookings);
router.post('/bookings/:id/cancel', adminCancelBooking);
router.get('/bookings/:id/tickets', adminGetBookingTickets);

// Clients & manual tickets
router.get('/clients', adminListClients);
router.post('/tickets/manual', adminIssueManualTicket);

// Door attendance
router.get('/door/events', adminDoorEvents);
router.get('/door/events/:eventId/guests', adminDoorEventGuests);

// Contact inbox
router.get('/contact-messages', adminListContactMessages);
router.get('/contact-messages/:id', adminGetContactMessage);
router.put('/contact-messages/:id', adminUpdateContactMessage);
router.delete('/contact-messages/:id', adminDeleteContactMessage);

// Agents
router.get('/agents', adminListAgents);
router.post('/agents', adminCreateAgent);
router.put('/agents/:id', adminUpdateAgent);
router.delete('/agents/:id', adminDeleteAgent);

// Content
router.get('/content', adminGetContent);
router.put('/content', adminUpdateContent);

// Sections
router.get('/sections', adminGetSections);
router.put('/sections', adminUpdateSections);
router.post('/sections', adminAddSection);
router.put('/sections/:sectionId', adminUpdateSection);
router.delete('/sections/:sectionId', adminDeleteSection);

// Banners
router.post('/banners', adminAddBanner);
router.delete('/banners/:bannerId', adminDeleteBanner);

export default router;
