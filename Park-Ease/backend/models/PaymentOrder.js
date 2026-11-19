const mongoose = require('mongoose');

const paymentOrderSchema = new mongoose.Schema({
  providerOrderId: {
    type: String,
    required: true,
    unique: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  parkingSpace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingSpace',
    required: true
  },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  vehicleNumber: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  status: {
    type: String,
    enum: ['created', 'processing', 'paid', 'failed', 'refunded'],
    default: 'created'
  },
  paymentId: { type: String, default: null },
  paymentMethod: { type: String, default: null },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 15 * 60 * 1000),
    index: { expires: 0 }
  }
}, { timestamps: true });

module.exports = mongoose.model('PaymentOrder', paymentOrderSchema);
