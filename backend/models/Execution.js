import mongoose from 'mongoose';

const ExecutionStepSchema = new mongoose.Schema({
  text: String,
  link: String,
  checked: Boolean,
  executedAt: Date,
  remarkText: String,
  remarkImage: String // 图片URL
});

const ExecutionSchema = new mongoose.Schema({
  runbookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Runbook' },
  runbookTitle: String,
  incidentId: String,
  priority: String,
  status: { type: String, default: '进行中' },
  operator: String,
  startedAt: { type: Date, default: Date.now },
  finishedAt: Date,
  steps: [ExecutionStepSchema]
});

export default mongoose.model('Execution', ExecutionSchema); 