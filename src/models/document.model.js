const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    filename: String,
    originalname: String,
    url: String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    folder: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder' },
  uploadedAt: { type: Date, default: Date.now }, // mantenido por compatibilidad hacia atrás; createdAt también disponible por timestamps
    sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        delete ret._id;
        return ret;
      }
    },
    toObject: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        delete ret._id;
        return ret;
      }
    }
  }
);

module.exports = mongoose.model('Document', documentSchema);
