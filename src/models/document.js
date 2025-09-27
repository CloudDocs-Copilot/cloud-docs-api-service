import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  filename: String,
  originalname: String,
  url: String,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  folder: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder' },
  uploadedAt: { type: Date, default: Date.now },
  sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});

export default mongoose.model('Document', documentSchema);