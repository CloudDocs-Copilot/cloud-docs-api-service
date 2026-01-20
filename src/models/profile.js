import mongoose from 'mongoose';

const profileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  name: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const Profile = mongoose.model('Profile', profileSchema);
export default Profile;
