import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Event } from '../models/Event.js';
import { TicketTier } from '../models/TicketTier.js';
import { Character } from '../models/Character.js';
import { SiteContent } from '../models/SiteContent.js';
import { Booking } from '../models/Booking.js';
import { Ticket } from '../models/Ticket.js';
import { ScanLog } from '../models/ScanLog.js';
import { Media } from '../models/Media.js';
import { DEFAULT_TERMS_AND_CONDITIONS } from '../constants/terms.js';
import { colorForTierName } from '../constants/ticketTiers.js';

dotenv.config();

const DEFAULT_SECTIONS = [
  { id: 'hero', type: 'hero', label: 'Hero', visible: true, order: 0, config: {} },
  { id: 'stats', type: 'stats', label: 'Stats', visible: true, order: 1, config: {} },
  { id: 'upcoming_events', type: 'upcoming_events', label: 'Upcoming Events', visible: true, order: 2, config: {} },
  { id: 'characters', type: 'characters', label: 'Top Characters', visible: true, order: 3, config: {} },
  { id: 'past_events', type: 'past_events', label: 'Past Events', visible: true, order: 4, config: {} },
  { id: 'about', type: 'about', label: 'About FUSE Story', visible: true, order: 5, config: {} },
  { id: 'contact', type: 'contact', label: 'Contact & Support', visible: true, order: 6, config: {} },
  { id: 'cta', type: 'cta', label: 'CTA Band', visible: true, order: 7, config: {} },
];

/**
 * Bootstrap with only the two Egypt upcoming events for ticket testing.
 * Wipes content collections, recreates staff accounts + site content + those events.
 */
async function seed() {
  await connectDB();

  await Promise.all([
    User.deleteMany({}),
    Event.deleteMany({}),
    TicketTier.deleteMany({}),
    Character.deleteMany({}),
    SiteContent.deleteMany({}),
    Booking.deleteMany({}),
    Ticket.deleteMany({}),
    ScanLog.deleteMany({}),
    Media.deleteMany({}),
  ]);

  const adminHash = await bcrypt.hash('admin123', 10);
  const seifHash = await bcrypt.hash('seif', 10);
  const agentHash = await bcrypt.hash('agent123', 10);

  await User.create({
    name: 'Admin',
    email: 'admin@fuse.events',
    passwordHash: adminHash,
    role: 'admin',
    country: 'ALL',
  });

  await User.create({
    name: 'Seif',
    username: 'seif',
    email: 'seif@fuse.events',
    passwordHash: seifHash,
    role: 'gate_agent',
    country: 'ALL',
    assignedEventIds: [],
  });

  await User.create({
    name: 'Gate Agent',
    email: 'agent@fuse.events',
    passwordHash: agentHash,
    role: 'gate_agent',
    country: 'ALL',
    assignedEventIds: [],
  });

  await SiteContent.create({
    key: 'home',
    about:
      'FUSE is a Kuwait events company that opened in Egypt — curating unforgettable nights with world-class production, bold lineups, and a community that shows up for the music.',
    termsAndConditions: DEFAULT_TERMS_AND_CONDITIONS,
    contact: {
      email: 'fuse.contact@fuseevents.net',
      phone: '+965 512 51241',
      phoneKW: '+965 512 51241',
      phoneEG: '+20 103 925 2562',
      instagram: 'https://www.instagram.com/fuse.eventsco',
      whatsapp: '+965 512 51241',
    },
    stats: { eventsThrown: 0, countries: 2, guestsHosted: 0 },
    sections: DEFAULT_SECTIONS,
    banners: [],
  });

  const neon = await Event.create({
    title: 'Neon Nights Cairo',
    slug: 'neon-nights-cairo',
    description: 'Club night under neon lights in New Cairo.',
    country: 'EG',
    city: 'Cairo',
    venue: 'The Villa, New Cairo',
    startsAt: new Date('2026-10-18T18:00:00.000Z'),
    endsAt: new Date('2026-10-19T02:00:00.000Z'),
    timezone: 'Africa/Cairo',
    category: 'club night',
    status: 'upcoming',
    capacity: 1800,
    featured: true,
    ticketsSold: 0,
    checkInCount: 0,
    attendanceCount: 0,
    coverImage: '',
    images: [],
    gallery: [],
  });

  const sunset = await Event.create({
    title: 'Sunset Sessions',
    slug: 'sunset-sessions',
    description: 'Sunset concert overlooking the Nile.',
    country: 'EG',
    city: 'Cairo',
    venue: 'Nile Deck, Cairo',
    startsAt: new Date('2026-11-09T16:00:00.000Z'),
    endsAt: new Date('2026-11-09T23:00:00.000Z'),
    timezone: 'Africa/Cairo',
    category: 'concert',
    status: 'upcoming',
    capacity: 800,
    featured: true,
    ticketsSold: 0,
    checkInCount: 0,
    attendanceCount: 0,
    coverImage: '',
    images: [],
    gallery: [],
  });

  await TicketTier.insertMany([
    {
      eventId: neon._id,
      name: 'Regular',
      color: colorForTierName('Regular'),
      price: 500,
      currency: 'EGP',
      quantity: 1200,
      sold: 0,
      maxPerOrder: 10,
      sortOrder: 0,
      isActive: true,
    },
    {
      eventId: neon._id,
      name: 'VIP',
      color: colorForTierName('VIP'),
      price: 1200,
      currency: 'EGP',
      quantity: 300,
      sold: 0,
      maxPerOrder: 6,
      sortOrder: 1,
      isActive: true,
    },
    {
      eventId: sunset._id,
      name: 'Regular',
      color: colorForTierName('Regular'),
      price: 350,
      currency: 'EGP',
      quantity: 500,
      sold: 0,
      maxPerOrder: 10,
      sortOrder: 0,
      isActive: true,
    },
    {
      eventId: sunset._id,
      name: 'Gold',
      color: colorForTierName('Gold'),
      price: 750,
      currency: 'EGP',
      quantity: 150,
      sold: 0,
      maxPerOrder: 6,
      sortOrder: 1,
      isActive: true,
    },
  ]);

  console.log('Seed complete — only Neon Nights Cairo + Sunset Sessions kept for ticket testing');
  console.log('Admin: admin@fuse.events / admin123');
  console.log('Seif:  seif / seif  (gate agent)');
  console.log('Agent: agent@fuse.events / agent123');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
