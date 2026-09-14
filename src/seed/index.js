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
 * Bootstrap only — no demo events, artists, bookings, or tickets.
 * Safe to re-run: wipes content collections, then recreates admin accounts + empty site content.
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

  const adminHash = await bcrypt.hash('admin123', 12);
  const seifHash = await bcrypt.hash('seif', 12);
  const agentHash = await bcrypt.hash('agent123', 12);

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
    role: 'admin',
    country: 'ALL',
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

  console.log('Seed complete — database cleared of dummy data');
  console.log('Created: admin, seif, gate agent, empty home content (no events/tickets)');
  console.log('Admin: admin@fuse.events / admin123');
  console.log('Seif:  seif@fuse.events / seif  (or username: seif)');
  console.log('Agent: agent@fuse.events / agent123');
  console.log('Change these passwords after first login.');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
