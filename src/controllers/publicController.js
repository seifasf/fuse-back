import { Event } from '../models/Event.js';
import { TicketTier } from '../models/TicketTier.js';
import { Character } from '../models/Character.js';
import { SiteContent } from '../models/SiteContent.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const notDeleted = { deletedAt: null };

export const listEvents = asyncHandler(async (req, res) => {
  const { country, status, featured, category, limit = 20, page = 1 } = req.query;
  const filter = { ...notDeleted };
  if (country) filter.country = country;
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (featured === 'true') filter.featured = true;

  const skip = (Number(page) - 1) * Number(limit);
  const [events, total] = await Promise.all([
    Event.find(filter).sort({ startsAt: 1 }).skip(skip).limit(Number(limit)).lean(),
    Event.countDocuments(filter),
  ]);

  res.json({ events, total, page: Number(page), limit: Number(limit) });
});

export const getEvent = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const isObjectId = /^[a-f\d]{24}$/i.test(slug);
  const event = isObjectId
    ? await Event.findOne({ _id: slug, ...notDeleted }).lean()
    : await Event.findOne({ slug, ...notDeleted }).lean();
  if (!event) return res.status(404).json({ code: 'NOT_FOUND', message: 'Event not found' });

  const tiers = await TicketTier.find({ eventId: event._id, isActive: true })
    .sort({ sortOrder: 1, price: 1 })
    .lean();
  const characters = event.characterIds?.length
    ? await Character.find({ _id: { $in: event.characterIds }, ...notDeleted }).lean()
    : [];

  res.json({ event, tiers, characters });
});

export const listCharacters = asyncHandler(async (req, res) => {
  const { featured, limit = 20 } = req.query;
  const filter = { ...notDeleted };
  if (featured === 'true') filter.featured = true;

  const characters = await Character.find(filter)
    .sort({ sortOrder: 1, name: 1 })
    .limit(Number(limit))
    .lean();
  res.json({ characters });
});

export const getCharacter = asyncHandler(async (req, res) => {
  const character = await Character.findOne({ slug: req.params.slug, ...notDeleted }).lean();
  if (!character) return res.status(404).json({ code: 'NOT_FOUND', message: 'Character not found' });

  const events = character.relatedEventIds?.length
    ? await Event.find({ _id: { $in: character.relatedEventIds }, ...notDeleted }).lean()
    : [];

  res.json({ character, events });
});

export const getHomeContent = asyncHandler(async (req, res) => {
  const { country } = req.query;
  const content = await SiteContent.findOne({ key: 'home' }).lean();

  const eventFilter = { status: 'upcoming', ...notDeleted };
  if (country) eventFilter.country = country;

  const [featuredEvent, upcomingEvents, characters, pastEvents] = await Promise.all([
    Event.findOne({ ...eventFilter, featured: true }).sort({ startsAt: 1 }).lean(),
    Event.find(eventFilter).sort({ startsAt: 1 }).limit(16).lean(),
    Character.find({ ...notDeleted }).sort({ sortOrder: 1 }).limit(20).lean(),
    Event.find({ status: 'past', ...notDeleted }).sort({ startsAt: -1 }).limit(12).lean(),
  ]);

  res.json({
    content: content || { stats: { eventsThrown: 0, countries: 2, guestsHosted: 0 }, sections: [] },
    featuredEvent,
    upcomingEvents,
    characters,
    pastEvents,
  });
});
