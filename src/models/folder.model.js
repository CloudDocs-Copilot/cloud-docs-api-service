const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    documents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }]
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

// Nombre de carpeta único por propietario
folderSchema.index({ owner: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Folder', folderSchema);
