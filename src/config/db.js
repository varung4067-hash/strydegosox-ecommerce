const mongoose = require('mongoose');

async function connectDatabase() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing');
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 20,
    minPoolSize: 2
  });
  console.log('✓ MongoDB connected');
}

module.exports = connectDatabase;
