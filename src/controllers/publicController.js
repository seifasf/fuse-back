import { Event } from '../models/Event.js';
import { TicketTier } from '../models/TicketTier.js';
import { Character } from '../models/Character.js';
import { SiteContent } from '../models/SiteContent.js';
import { ContactMessage } from '../models/ContactMessage.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { DEFAULT_TERMS_AND_CONDITIONS } from '../constants/terms.js';
import { cacheGet, cacheSet } from '../utils/memoryCache.js';

const notDeleted = { deletedAt: null };
const publicVisible = { ...notDeleted, visibleOnSite: { $ne: false } };

let cachedSiteTerms = { value: null, expires: 0 };

async function resolveTerms(eventTerms) {
  const custom = typeof eventTerms === 'string' ? eventTerms.trim() : '';
  if (custom) return custom;
  if (cachedSiteTerms.expires > Date.now() && cachedSiteTerms.value != null) {
    return cachedSiteTerms.value;
  }
  const content = await SiteContent.findOne({ key: 'home' }).select('termsAndConditions').lean();
  const siteTerms = content?.termsAndConditions?.trim() || DEFAULT_TERMS_AND_CONDITIONS;
  cachedSiteTerms = { value: siteTerms, expires: Date.now() + 60_000 };
  return siteTerms;
}

/** Card lists — keep payloads small (no gallery / images arrays). */
const EVENT_CARD_FIELDS =
  'title slug country city venue startsAt endsAt category coverImage status featured capacity';
const CHARACTER_CARD_FIELDS = 'name slug image tags country featured sortOrder';

export const listEvents = asyncHandler(async (req, res) => {
  const { country, status, featured, category, limit = 20, page = 1 } = req.query;
  const cacheKey = `public:events:${country || ''}:${status || ''}:${featured || ''}:${category || ''}:${page}:${limit}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }

  const filter = { ...publicVisible };
  if (country) filter.country = country;
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (featured === 'true') filter.featured = true;

  const skip = (Number(page) - 1) * Number(limit);
  const [events, total] = await Promise.all([
    Event.find(filter)
      .select(EVENT_CARD_FIELDS)
      .sort({ startsAt: 1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Event.countDocuments(filter),
  ]);

  const payload = { events, total, page: Number(page), limit: Number(limit) };
  cacheSet(cacheKey, payload, 20_000);
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  res.set('X-Cache', 'MISS');
  res.json(payload);
});

export const getEvent = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const cacheKey = `public:event:${slug}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=45');
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }

  const isObjectId = /^[a-f\d]{24}$/i.test(slug);
  const event = isObjectId
    ? await Event.findOne({ _id: slug, ...publicVisible }).lean()
    : await Event.findOne({ slug, ...publicVisible }).lean();
  if (!event) return res.status(404).json({ code: 'NOT_FOUND', message: 'Event not found' });

  const [tiers, characters, terms] = await Promise.all([
    TicketTier.find({ eventId: event._id, isActive: true })
      .sort({ sortOrder: 1, price: 1 })
      .select('name color price currency quantity sold maxPerOrder sortOrder eventId isActive')
      .lean(),
    event.characterIds?.length
      ? Character.find({ _id: { $in: event.characterIds }, ...notDeleted })
          .select('name slug image tags bio country featured sortOrder')
          .lean()
      : Promise.resolve([]),
    resolveTerms(event.termsAndConditions),
  ]);

  const payload = { event, tiers, characters, terms };
  cacheSet(cacheKey, payload, 12_000);
  res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=45');
  res.set('X-Cache', 'MISS');
  res.json(payload);
});

export const listCharacters = asyncHandler(async (req, res) => {
  const { featured, limit = 20 } = req.query;
  const cacheKey = `public:characters:${featured || ''}:${limit}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }

  const filter = { ...notDeleted };
  if (featured === 'true') filter.featured = true;

  const characters = await Character.find(filter)
    .select(CHARACTER_CARD_FIELDS)
    .sort({ sortOrder: 1, name: 1 })
    .limit(Number(limit))
    .lean();
  const payload = { characters };
  cacheSet(cacheKey, payload, 30_000);
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  res.set('X-Cache', 'MISS');
  res.json(payload);
});

export const getCharacter = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const cacheKey = `public:character:${slug}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }

  const character = await Character.findOne({ slug, ...notDeleted }).lean();
  if (!character) return res.status(404).json({ code: 'NOT_FOUND', message: 'Character not found' });

  const events = character.relatedEventIds?.length
    ? await Event.find({ _id: { $in: character.relatedEventIds }, ...publicVisible })
        .select(EVENT_CARD_FIELDS)
        .lean()
    : [];

  const payload = { character, events };
  cacheSet(cacheKey, payload, 30_000);
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  res.set('X-Cache', 'MISS');
  res.json(payload);
});

export const submitContactMessage = asyncHandler(async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

  if (!name || name.length < 2) {
    throw new AppError('Please enter your name', 400, 'VALIDATION_ERROR');
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError('Please enter a valid email', 400, 'VALIDATION_ERROR');
  }
  if (!message || message.length < 5) {
    throw new AppError('Please enter a message', 400, 'VALIDATION_ERROR');
  }

  const doc = await ContactMessage.create({
    name: name.slice(0, 120),
    email: email.slice(0, 200),
    phone: phone.slice(0, 40),
    message: message.slice(0, 5000),
    source: 'website',
    ip: String(req.ip || req.headers['x-forwarded-for'] || '').slice(0, 80),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 400),
  });

  res.status(201).json({
    ok: true,
    id: doc._id,
    message: 'Message received — we will get back to you soon.',
  });
});

export const getHomeContent = asyncHandler(async (req, res) => {
  const { country } = req.query;
  const cacheKey = `public:home:${country || 'ALL'}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set('Cache-Control', 'public, max-age=20, stale-while-revalidate=60');
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }

  const eventFilter = { status: 'upcoming', ...publicVisible };
  const pastFilter = { status: 'past', ...publicVisible };
  const characterFilter = { ...notDeleted };
  if (country) {
    eventFilter.country = country;
    pastFilter.country = country;
    characterFilter.$or = [{ country }, { country: { $exists: false } }, { country: null }];
  }

  let [content, featuredEvent, upcomingEvents, characters, pastEvents] = await Promise.all([
    SiteContent.findOne({ key: 'home' })
      .select('key about contact stats banners sections termsAndConditions')
      .lean(),
    Event.findOne({ ...eventFilter, featured: true })
      .select(EVENT_CARD_FIELDS)
      .sort({ startsAt: 1 })
      .lean(),
    Event.find(eventFilter).select(EVENT_CARD_FIELDS).sort({ startsAt: 1 }).limit(16).lean(),
    Character.find(characterFilter)
      .select(CHARACTER_CARD_FIELDS)
      .sort({ sortOrder: 1 })
      .limit(20)
      .lean(),
    Event.find(pastFilter).select(EVENT_CARD_FIELDS).sort({ startsAt: -1 }).limit(12).lean(),
  ]);

  // Country filter can empty the homepage — fall back to all markets so featured still shows
  if (country && !featuredEvent && !(upcomingEvents && upcomingEvents.length)) {
    const fallbackFilter = { status: 'upcoming', ...publicVisible };
    [featuredEvent, upcomingEvents] = await Promise.all([
      Event.findOne({ ...fallbackFilter, featured: true })
        .select(EVENT_CARD_FIELDS)
        .sort({ startsAt: 1 })
        .lean(),
      Event.find(fallbackFilter).select(EVENT_CARD_FIELDS).sort({ startsAt: 1 }).limit(16).lean(),
    ]);
  }
  if (country && !featuredEvent && upcomingEvents?.length) {
    featuredEvent = upcomingEvents.find((e) => e.featured) || upcomingEvents[0] || null;
  }

  const payload = {
    content: content
      ? {
          ...content,
          termsAndConditions:
            content.termsAndConditions?.trim() || DEFAULT_TERMS_AND_CONDITIONS,
        }
      : {
          stats: { eventsThrown: 0, countries: 2, guestsHosted: 0 },
          sections: [],
          termsAndConditions: DEFAULT_TERMS_AND_CONDITIONS,
        },
    featuredEvent,
    upcomingEvents,
    characters,
    pastEvents,
  };

  cacheSet(cacheKey, payload, 15_000);
  res.set('Cache-Control', 'public, max-age=20, stale-while-revalidate=60');
  res.set('X-Cache', 'MISS');
  res.json(payload);
});
