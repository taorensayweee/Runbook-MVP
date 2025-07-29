import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Runbook from './models/Runbook.js';
import Execution from './models/Execution.js';

const app = express();
const PORT = 5000;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/runbook';

app.use(cors());
app.use(express.json());

// 静态资源服务（图片）
app.use('/uploads', express.static(path.resolve('uploads')));

// 确保uploads目录存在
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// Multer配置（本地图片上传）
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, name + '-' + Date.now() + ext);
  }
});
const upload = multer({ storage });

// 图片上传接口
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

// Runbook CRUD
app.get('/api/runbooks', async (req, res) => {
  const runbooks = await Runbook.find().sort({ createdAt: -1 });
  res.json(runbooks);
});

app.get('/api/runbooks/:id', async (req, res) => {
  const runbook = await Runbook.findById(req.params.id);
  res.json(runbook);
});

app.post('/api/runbooks', async (req, res) => {
  const runbook = new Runbook(req.body);
  await runbook.save();
  res.json(runbook);
});

app.put('/api/runbooks/:id', async (req, res) => {
  const runbook = await Runbook.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(runbook);
});

app.delete('/api/runbooks/:id', async (req, res) => {
  await Runbook.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// Execution CRUD
app.post('/api/executions', async (req, res) => {
  const { runbookId, incidentId, operator, priority } = req.body;
  const runbook = await Runbook.findById(runbookId);
  if (!runbook) return res.status(404).json({ error: 'Runbook not found' });
  const steps = runbook.steps.map(s => ({ text: s.text, link: s.link, checked: false }));
  const execution = new Execution({
    runbookId,
    runbookTitle: runbook.title,
    incidentId,
    operator,
    priority,
    steps
  });
  await execution.save();
  res.json(execution);
});

app.get('/api/executions', async (req, res) => {
  const executions = await Execution.find().sort({ startedAt: -1 });
  res.json(executions);
});

app.get('/api/executions/:id', async (req, res) => {
  const execution = await Execution.findById(req.params.id);
  res.json(execution);
});

app.put('/api/executions/:id', async (req, res) => {
  const execution = await Execution.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(execution);
});

app.delete('/api/executions/:id', async (req, res) => {
  await Execution.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// Checklist步骤勾选/备注/图片
app.patch('/api/executions/:id/step/:stepIdx', async (req, res) => {
  const { checked, remarkText, remarkImage } = req.body;
  const execution = await Execution.findById(req.params.id);
  if (!execution) return res.status(404).json({ error: 'Execution not found' });
  const step = execution.steps[req.params.stepIdx];
  if (typeof checked === 'boolean') {
    step.checked = checked;
    step.executedAt = checked ? new Date() : null;
  }
  if (typeof remarkText === 'string') step.remarkText = remarkText;
  if (typeof remarkImage === 'string') step.remarkImage = remarkImage;
  await execution.save();
  res.json(execution);
});

// 批量更新多个步骤
app.patch('/api/executions/:id/steps/batch', async (req, res) => {
  const { updates } = req.body; // updates: [{ stepIdx, patch }, ...]
  const execution = await Execution.findById(req.params.id);
  if (!execution) return res.status(404).json({ error: 'Execution not found' });
  
  // 应用所有更新
  updates.forEach(({ stepIdx, patch }) => {
    const step = execution.steps[stepIdx];
    if (!step) return;
    
    const { checked, remarkText, remarkImage } = patch;
    if (typeof checked === 'boolean') {
      step.checked = checked;
      step.executedAt = checked ? new Date() : null;
    }
    if (typeof remarkText === 'string') step.remarkText = remarkText;
    if (typeof remarkImage === 'string') step.remarkImage = remarkImage;
  });
  
  await execution.save();
  res.json(execution);
});

mongoose.connect(MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT}`);
    });
  })
  .catch(err => console.error('MongoDB connection error:', err)); 