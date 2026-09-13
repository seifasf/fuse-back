import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { Event } from '../models/Event.js';
import { TicketTier } from '../models/TicketTier.js';
import { Booking } from '../models/Booking.js';
import { Ticket } from '../models/Ticket.js';
import { User } from '../models/User.js';
import { generateTicketCode } from '../utils/ticketCode.js';
import { signQrPayload } from '../services/qr.js';

const SAMPLE_GUESTS = [
  { name: 'Omar Al-Sabah', email: 'omar.sabah@gmail.com', phone: '+965 9912 3456' },
  { name: 'Nour El-Din', email: 'nour.eldin@outlook.com', phone: '+20 100 123 4567' },
  { name: 'Fahad Al-Mutawa', email: 'fahad.mutawa@gmail.com', phone: '+965 5523 4567' },
  { name: 'Youssef Mansour', email: 'ymansour@yahoo.com', phone: '+20 122 345 6789' },
  { name: 'Layla Al-Khatib', email: 'layla.khatib@gmail.com', phone: '+965 6634 5678' },
  { name: 'Salma El-Gendy', email: 'salma.gendy@gmail.com', phone: '+20 111 456 7890' },
  { name: 'Hamad Al-Ghanim', email: 'hamad.ghanim@gmail.com', phone: '+965 9945 6789' },
  { name: 'Ziad Sherif', email: 'ziad.sherif@hotmail.com', phone: '+20 102 567 8901' },
  { name: 'Fatima Al-Rashid', email: 'fatima.rashid@gmail.com', phone: '+965 5556 7890' },
  { name: 'Karim Abdel-Nasser', email: 'karim.nasser@gmail.com', phone: '+20 120 678 9012' },
  { name: 'Abdullah Al-Kandari', email: 'a.kandari@gmail.com', phone: '+965 6667 8901' },
  { name: 'Mariam Farouk', email: 'mariam.farouk@outlook.com', phone: '+20 112 789 0123' },
  { name: 'Saad Al-Otaibi', email: 'saad.otaibi@gmail.com', phone: '+965 9978 9012' },
  { name: 'Rana Soliman', email: 'rana.soliman@gmail.com', phone: '+20 101 890 1234' },
  { name: 'Mishari Al-Bader', email: 'mishari.bader@gmail.com', phone: '+965 5589 0123' },
  { name: 'Tarek Hegazy', email: 'tarek.hegazy@gmail.com', phone: '+20 121 901 2345' },
];

async function seedBookings() {
  await connectDB();

  console.log('Seeding realistic FUSE bookings and tickets...');
  await Booking.deleteMany({});
  await Ticket.deleteMany({});

  const events = await Event.find({}).lean();
  const tiers = await TicketTier.find({}).lean();

  if (events.length === 0 || tiers.length === 0) {
    console.log('No events or tiers found.');
    process.exit(1);
  }

  let totalTicketsCreated = 0;
  let totalBookingsCreated = 0;

  for (const event of events) {
    const eventTiers = tiers.filter((t) => String(t.eventId) === String(event._id));
    if (eventTiers.length === 0) continue;

    // Distribute 8-15 bookings per event
    const bookingCount = event.status === 'past' ? 14 : 10;
    let eventTicketsSold = 0;

    for (let i = 0; i < bookingCount; i++) {
      const guest = SAMPLE_GUESTS[(totalBookingsCreated + i) % SAMPLE_GUESTS.length];
      const tier = eventTiers[i % eventTiers.length];
      const qty = (i % 3) + 1; // 1 to 3 tickets per booking
      const total = tier.price * qty;

      const bookingDate = new Date();
      bookingDate.setDate(bookingDate.getDate() - (14 - i)); // spread over past 14 days

      const booking = await Booking.create({
        guest,
        eventId: event._id,
        eventSnapshot: {
          title: event.title,
          country: event.country,
          startsAt: event.startsAt,
          venue: event.venue,
        },
        items: [
          {
            tierId: tier._id,
            tierName: tier.name,
            qty,
            unitPrice: tier.price,
          },
        ],
        ticketCount: qty,
        total,
        currency: tier.currency,
        status: 'paid',
        paymentProvider: event.country === 'KW' ? 'myfatoorah' : 'paymob',
        paymentRef: `PAY-${Date.now()}-${totalBookingsCreated}`,
        paidAt: bookingDate,
        createdAt: bookingDate,
        updatedAt: bookingDate,
      });

      totalBookingsCreated++;
      eventTicketsSold += qty;

      // Create individual tickets
      for (let q = 0; q < qty; q++) {
        const ticketId = new mongoose.Types.ObjectId();
        const code = generateTicketCode();
        const qrPayload = signQrPayload(ticketId, booking._id, event._id);
        const isUsed = event.status === 'past' || (i % 3 === 0); // 33% checked in or all past

        await Ticket.create({
          _id: ticketId,
          bookingId: booking._id,
          eventId: event._id,
          tierId: tier._id,
          code,
          qrPayload,
          status: isUsed ? 'used' : 'valid',
          holderName: guest.name,
          holderEmail: guest.email,
          holderPhone: guest.phone,
          tierName: tier.name,
          eventTitle: event.title,
          scannedAt: isUsed ? new Date(bookingDate.getTime() + 2 * 3600000) : null,
          createdAt: bookingDate,
          updatedAt: bookingDate,
        });

        totalTicketsCreated++;
      }
    }

    // Update event ticketsSold
    await Event.findByIdAndUpdate(event._id, { ticketsSold: eventTicketsSold });
  }

  console.log(`Seeded ${totalBookingsCreated} bookings and ${totalTicketsCreated} tickets successfully.`);
  await mongoose.disconnect();
}

seedBookings().catch((err) => {
  console.error(err);
  process.exit(1);
});
