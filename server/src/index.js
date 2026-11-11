import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import deviceRoutes from './routes/devices.js';
import dashboardRoutes from './routes/dashboard.js';
import auditRoutes from './routes/audit.js';
dotenv.config();
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}
const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (_req,res) => res.json({ ok:true, service:'NEXUS PRO ENTERPRISE API' }));
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use((err,_req,res,_next) => {
  console.error(err);
  res.status(500).json({ error:'Unexpected server error' });
});
const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`NEXUS PRO API listening on ${port}`));
