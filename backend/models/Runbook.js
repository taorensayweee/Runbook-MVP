import mongoose from 'mongoose';

const StepSchema = new mongoose.Schema({
  text: String,
  link: String,
  checked: Boolean,
  image: String // 图片URL
});

const RunbookSchema = new mongoose.Schema({
  title: String,
  description: String,
  steps: [StepSchema],
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Runbook', RunbookSchema); 