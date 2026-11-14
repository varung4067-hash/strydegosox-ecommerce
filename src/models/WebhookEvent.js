const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  event: { type: String, required: true },
  receivedAt: { type: Date, default: Date.now },
  processed: { type: Boolean, default: false }
});

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
