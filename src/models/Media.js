import mongoose from 'mongoose';

/**
 * Uploaded website images stored in Atlas.
 * Avoids Render's ephemeral disk — files survive restarts/deploys.
 */
const mediaSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true, maxlength: 200 },
    mimeType: {
      type: String,
      required: true,
      enum: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    },
    size: { type: Number, required: true, min: 1 },
    data: { type: Buffer, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    alt: { type: String, default: '', maxlength: 200 },
  },
  { timestamps: true }
);

mediaSchema.index({ createdAt: -1 });

export const Media = mongoose.model('Media', mediaSchema);
