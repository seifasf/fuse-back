import mongoose from 'mongoose';
import { SECTION_TYPES } from './constants.js';

const sectionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: { type: String, enum: SECTION_TYPES, required: true },
    label: { type: String, default: '', maxlength: 80 },
    visible: { type: Boolean, default: true },
    order: { type: Number, default: 0, min: 0 },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, default: '', maxlength: 120 },
    subtitle: { type: String, default: '', maxlength: 240 },
    image: { type: String, default: '' },
    cta: { type: String, default: 'Get tickets', maxlength: 40 },
    link: { type: String, default: '/events', maxlength: 300 },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: false }
);

const siteContentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, maxlength: 40 },
    banners: {
      type: [bannerSchema],
      default: [],
      validate: [(arr) => arr.length <= 10, 'Max 10 banners'],
    },
    about: { type: String, default: '', maxlength: 10000 },
    contact: {
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      phoneKW: { type: String, default: '' },
      phoneEG: { type: String, default: '' },
      instagram: { type: String, default: '' },
      whatsapp: { type: String, default: '' },
    },
    stats: {
      eventsThrown: { type: Number, default: 0, min: 0 },
      countries: { type: Number, default: 2, min: 0 },
      guestsHosted: { type: Number, default: 0, min: 0 },
    },
    sections: {
      type: [sectionSchema],
      default: [],
      validate: [(arr) => arr.length <= 20, 'Max 20 sections'],
    },
  },
  { timestamps: true }
);

export const SiteContent = mongoose.model('SiteContent', siteContentSchema);
