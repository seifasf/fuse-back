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

dotenv.config();

const DEFAULT_SECTIONS = [
  { id: 'hero', type: 'hero', label: 'Hero', visible: true, order: 0, config: {} },
  { id: 'stats', type: 'stats', label: 'Stats', visible: true, order: 1, config: {} },
  { id: 'upcoming_events', type: 'upcoming_events', label: 'Upcoming Events', visible: true, order: 2, config: {} },
  { id: 'characters', type: 'characters', label: 'Top Characters', visible: true, order: 3, config: {} },
  { id: 'past_events', type: 'past_events', label: 'Past Events', visible: true, order: 4, config: {} },
  { id: 'cta', type: 'cta', label: 'CTA Band', visible: true, order: 5, config: {} },
];

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

  const events = await Event.insertMany([
    {
      title: 'Neon Nights Cairo',
      slug: 'neon-nights-cairo',
      description:
        "Cairo's biggest club night — international DJs, full production, and a crowd that doesn't quit until sunrise.",
      country: 'EG',
      city: 'Cairo',
      venue: 'The Villa, New Cairo',
      address: 'New Cairo',
      startsAt: new Date('2026-10-18T21:00:00'),
      endsAt: new Date('2026-10-19T05:00:00'),
      timezone: 'Africa/Cairo',
      category: 'club night',
      coverImage: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1600&q=80',
      images: ['https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1600&q=80'],
      status: 'upcoming',
      capacity: 2000,
      featured: true,
      ticketsSold: 530,
    },
    {
      title: 'Kuwait Bass Festival',
      slug: 'kuwait-bass-festival',
      description: 'A bass-heavy festival experience on the waterfront — stages, lights, and nonstop energy.',
      country: 'KW',
      city: 'Kuwait City',
      venue: 'Marina Waves, Kuwait City',
      startsAt: new Date('2026-11-02T20:00:00'),
      endsAt: new Date('2026-11-03T04:00:00'),
      timezone: 'Asia/Kuwait',
      category: 'festival',
      coverImage: 'https://images.unsplash.com/photo-1459749411175-04bf5294ceea?w=1600&q=80',
      images: ['https://images.unsplash.com/photo-1459749411175-04bf5294ceea?w=1600&q=80'],
      status: 'upcoming',
      capacity: 1500,
      featured: false,
      ticketsSold: 345,
    },
    {
      title: 'Sunset Sessions',
      slug: 'sunset-sessions',
      description: 'Open-air concert series on the Nile — golden hour sets and live vocals.',
      country: 'EG',
      city: 'Cairo',
      venue: 'Nile Deck, Cairo',
      startsAt: new Date('2026-11-09T18:00:00'),
      endsAt: new Date('2026-11-09T23:00:00'),
      timezone: 'Africa/Cairo',
      category: 'concert',
      coverImage: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1600&q=80',
      images: ['https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1600&q=80'],
      status: 'upcoming',
      capacity: 800,
      featured: false,
      ticketsSold: 90,
    },
    {
      title: 'Afterglow Kuwait',
      slug: 'afterglow-kuwait',
      description: 'Late-night house and techno in a rooftop warehouse setting.',
      country: 'KW',
      city: 'Kuwait City',
      venue: 'Warehouse District',
      startsAt: new Date('2026-12-05T22:00:00'),
      endsAt: new Date('2026-12-06T05:00:00'),
      timezone: 'Asia/Kuwait',
      category: 'club night',
      coverImage: 'https://images.unsplash.com/photo-1571266028247-d220bbe74dca?w=1600&q=80',
      images: ['https://images.unsplash.com/photo-1571266028247-d220bbe74dca?w=1600&q=80'],
      status: 'upcoming',
      capacity: 900,
      featured: false,
      ticketsSold: 40,
    },
    {
      title: 'FUSE Anniversary',
      slug: 'fuse-anniversary',
      description: 'Celebrating one year of FUSE in Kuwait — the night that started it all.',
      country: 'KW',
      city: 'Kuwait City',
      venue: '360 Mall Rooftop',
      startsAt: new Date('2025-06-15T21:00:00'),
      endsAt: new Date('2025-06-16T04:00:00'),
      timezone: 'Asia/Kuwait',
      category: 'club night',
      coverImage: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1600&q=80',
      images: ['https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1600&q=80'],
      status: 'past',
      capacity: 1200,
      attendanceCount: 3200,
      checkInCount: 3100,
      ticketsSold: 3200,
      gallery: [
        'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=900&q=80',
        'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=900&q=80',
        'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=900&q=80',
      ],
      recap: 'Sold out rooftop. Bass until sunrise. The night FUSE became a name in Kuwait.',
    },
    {
      title: 'Desert Pulse',
      slug: 'desert-pulse',
      description: 'An outdoor night under the Cairo sky with deep house and live percussion.',
      country: 'EG',
      city: 'Giza',
      venue: 'Giza Plateau Grounds',
      startsAt: new Date('2025-09-20T19:00:00'),
      endsAt: new Date('2025-09-21T03:00:00'),
      timezone: 'Africa/Cairo',
      category: 'festival',
      coverImage: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=1600&q=80',
      images: ['https://images.unsplash.com/photo-1506157786151-b8491531f063?w=1600&q=80'],
      status: 'past',
      capacity: 2500,
      attendanceCount: 4100,
      checkInCount: 4000,
      ticketsSold: 4100,
      gallery: [
        'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=900&q=80',
        'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=900&q=80',
      ],
      recap: 'Open desert air, deep house, and 4,000 people moving as one.',
    },
  ]);

  await TicketTier.insertMany([
    { eventId: events[0]._id, name: 'General Admission', price: 500, currency: 'EGP', quantity: 1500, sold: 420, sortOrder: 0 },
    { eventId: events[0]._id, name: 'VIP', price: 1200, currency: 'EGP', quantity: 300, sold: 110, sortOrder: 1 },
    { eventId: events[1]._id, name: 'GA', price: 15, currency: 'KWD', quantity: 1000, sold: 280, sortOrder: 0 },
    { eventId: events[1]._id, name: 'VIP', price: 35, currency: 'KWD', quantity: 200, sold: 65, sortOrder: 1 },
    { eventId: events[2]._id, name: 'Standard', price: 350, currency: 'EGP', quantity: 600, sold: 90, sortOrder: 0 },
    { eventId: events[3]._id, name: 'Entry', price: 12, currency: 'KWD', quantity: 700, sold: 40, sortOrder: 0 },
  ]);

  const characters = await Character.insertMany([
    {
      name: 'DJ Nova',
      slug: 'dj-nova',
      bio: 'International techno DJ with residencies across MENA and a signature dark-room sound.',
      image: 'https://images.unsplash.com/photo-1571266028247-d220bbe74dca?w=600&q=80',
      tags: ['techno', 'dj'],
      country: 'EG',
      featured: true,
      sortOrder: 0,
      relatedEventIds: [events[0]._id, events[4]._id],
    },
    {
      name: 'Luna Vox',
      slug: 'luna-vox',
      bio: 'Vocalist and live performer known for festival anthems and electric stage presence.',
      image: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=600&q=80',
      tags: ['live', 'vocalist'],
      country: 'EG',
      featured: true,
      sortOrder: 1,
      relatedEventIds: [events[2]._id, events[5]._id],
    },
    {
      name: 'Bass Sultan',
      slug: 'bass-sultan',
      bio: "Kuwait's bass music pioneer — heavy drops, local grit, global taste.",
      image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&q=80',
      tags: ['bass', 'dj'],
      country: 'KW',
      featured: true,
      sortOrder: 2,
      relatedEventIds: [events[1]._id, events[3]._id],
    },
    {
      name: 'Maya Pulse',
      slug: 'maya-pulse',
      bio: 'House selector and producer bringing warm, late-night energy to every FUSE floor.',
      image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&q=80',
      tags: ['house', 'dj'],
      country: 'EG',
      featured: true,
      sortOrder: 3,
      relatedEventIds: [events[0]._id, events[3]._id],
    },
    {
      name: 'Rex Frequency',
      slug: 'rex-frequency',
      bio: 'Live electronic act blending synths, percussion, and immersive visuals.',
      image: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=600&q=80',
      tags: ['live', 'electronic'],
      country: 'KW',
      featured: true,
      sortOrder: 4,
      relatedEventIds: [events[1]._id, events[5]._id],
    },
  ]);

  await Event.findByIdAndUpdate(events[0]._id, {
    characterIds: [characters[0]._id, characters[3]._id],
  });
  await Event.findByIdAndUpdate(events[1]._id, {
    characterIds: [characters[2]._id, characters[4]._id],
  });
  await Event.findByIdAndUpdate(events[2]._id, {
    characterIds: [characters[1]._id],
  });

  await User.create({
    name: 'Gate Agent',
    email: 'agent@fuse.events',
    passwordHash: agentHash,
    role: 'gate_agent',
    country: 'ALL',
    assignedEventIds: [events[0]._id, events[1]._id],
  });

  await SiteContent.create({
    key: 'home',
    about:
      'FUSE is a Kuwait events company that opened in Egypt — curating unforgettable nights with world-class production, bold lineups, and a community that shows up for the music.',
    contact: {
      email: 'hello@fuse.events',
      phone: '+965 512 51241',
      phoneKW: '+965 512 51241',
      phoneEG: '+20 103 925 2562',
      instagram: 'https://www.instagram.com/fuse.eventsco',
      whatsapp: '+965 512 51241',
    },
    stats: { eventsThrown: 120, countries: 2, guestsHosted: 80000 },
    sections: DEFAULT_SECTIONS,
    banners: [
      {
        title: 'Feel the night',
        subtitle: 'Born in Kuwait. Opened in Egypt.',
        image: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1600&q=80',
        cta: 'Get tickets',
        link: '/events',
        active: true,
        sortOrder: 0,
      },
    ],
  });

  console.log('Seed complete — schema v2 on Atlas');
  console.log('Admin: admin@fuse.events / admin123');
  console.log('Agent: agent@fuse.events / agent123');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
