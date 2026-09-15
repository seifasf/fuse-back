import mongoose from 'mongoose';
import { USER_ROLES, COUNTRY_OR_ALL } from './constants.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    username: {
      type: String,
      lowercase: true,
      trim: true,
      unique: true,
      sparse: true,
      maxlength: 60,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    phone: { type: String, trim: true, maxlength: 32, default: '' },
    passwordHash: { type: String, select: false },
    role: {
      type: String,
      enum: USER_ROLES,
      default: 'client',
    },
    country: { type: String, enum: COUNTRY_OR_ALL, default: 'ALL' },
    /** Gate agents only — empty = all events (admin override), otherwise restricted */
    assignedEventIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Event' }],
    isActive: { type: Boolean, default: true },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  }
);

userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ deletedAt: 1 });

export const User = mongoose.model('User', userSchema);
