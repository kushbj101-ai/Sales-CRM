const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/crmdb';

mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Embedded Activity Schema
const ActivitySchema = new mongoose.Schema({
  note: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

// Lead / Deal Schema
const Lead = mongoose.model('Lead', new mongoose.Schema({
  name: { type: String, required: true },
  company: { type: String, required: true },
  email: { type: String, required: true },
  dealValue: { type: Number, required: true, min: 0 },
  stage: { 
    type: String, 
    enum: ['Discovery', 'Proposal', 'Negotiation', 'Closed-Won', 'Closed-Lost'],
    default: 'Discovery'
  },
  activities: [ActivitySchema],
  createdAt: { type: Date, default: Date.now }
}));

// GET: Fetch all leads + Pipeline Metrics
app.get('/api/leads', async (req, res) => {
  try {
    const leads = await Lead.find().sort({ createdAt: -1 });

    const metrics = {
      totalLeads: leads.length,
      totalPipelineValue: leads.reduce((sum, l) => sum + (l.dealValue || 0), 0),
      wonValue: leads.filter(l => l.stage === 'Closed-Won').reduce((sum, l) => sum + (l.dealValue || 0), 0),
      activeDeals: leads.filter(l => !['Closed-Won', 'Closed-Lost'].includes(l.stage)).length
    };

    res.json({ leads, metrics });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Create a new Lead
app.post('/api/leads', async (req, res) => {
  try {
    const { name, company, email, dealValue, stage, initialNote } = req.body;
    
    if (!name || !company || !email || dealValue === undefined) {
      return res.status(400).json({ error: 'Name, company, email, and deal value are required.' });
    }

    const lead = new Lead({
      name,
      company,
      email,
      dealValue: Number(dealValue),
      stage: stage || 'Discovery',
      activities: initialNote ? [{ note: initialNote }] : []
    });

    await lead.save();
    res.status(201).json(lead);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH: Update Deal Stage
app.patch('/api/leads/:id/stage', async (req, res) => {
  try {
    const { stage } = req.body;
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { 
        $set: { stage },
        $push: { activities: { note: `Stage changed to "${stage}"` } }
      },
      { new: true }
    );
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Append Activity Note to a Lead
app.post('/api/leads/:id/activities', async (req, res) => {
  try {
    const { note } = req.body;
    if (!note) return res.status(400).json({ error: 'Activity note is required.' });

    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { $push: { activities: { note } } },
      { new: true }
    );
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE: Remove a Lead
app.delete('/api/leads/:id', async (req, res) => {
  try {
    await Lead.findByIdAndDelete(req.params.id);
    res.json({ message: 'Lead deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('CRM Server running at http://localhost:3000'));