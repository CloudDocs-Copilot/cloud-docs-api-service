const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  documents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],
  createdAt: { type: Date, default: Date.now }
}, { toJSON: { virtuals: true, versionKey: false, transform: (_doc, ret) => { delete ret._id; return ret; } }, toObject: { virtuals: true, versionKey: false, transform: (_doc, ret) => { delete ret._id; return ret; } } });

module.exports = mongoose.model('Folder', folderSchema);