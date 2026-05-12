import 'dotenv/config';
import express     from 'express';
import cors        from 'cors';
import helmet      from 'helmet';
import morgan      from 'morgan';
import rateLimit   from 'express-rate-limit';
import path        from 'path';
import { fileURLToPath } from 'url';

import authRoutes     from './routes/auth.js';
import userRoutes     from './routes/user.js';
import wardrobeRoutes from './routes/wardrobe.js';
import outfitRoutes   from './routes/outfit.js';
import stylistRoutes  from './routes/stylist.js';
import stitchRoutes   from './routes/stitch.js';
import sketchRoutes   from './routes/sketch.js';
import weatherRoutes  from './routes/weather.js';
import notifRoutes    from './routes/notifications.js';

import { errorHandler } from './middleware/errorHandler.js';
import { authenticate } from './middleware/auth.js';
import { startCronJobs } from './services/cronService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', 1);

// Serve frontend — Express serves index.html at localhost:4000 (no CORS issues)
const frontendDir = path.resolve(__dirname, '../../frontend');
app.use(express.static(frontendDir));

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

app.use(cors({
  origin(origin, cb) {
    if (!origin || /localhost|127\.0\.0\.1/.test(origin)) return cb(null, true);
    if (origin === process.env.CLIENT_URL) return cb(null, true);
    cb(new Error('CORS: ' + origin));
  },
  credentials: true,
}));

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(morgan('dev'));

const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 30 });
const aiLimiter   = rateLimit({ windowMs: 60*1000, max: 30 });

app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// Public
app.use('/api/auth',    authLimiter, authRoutes);
app.use('/api/weather', weatherRoutes);

// Protected
app.use(authenticate);
app.use('/api/user',          userRoutes);
app.use('/api/wardrobe',      wardrobeRoutes);
app.use('/api/outfits',       outfitRoutes);
app.use('/api/stylist',       aiLimiter, stylistRoutes);
app.use('/api/stitch',        stitchRoutes);
app.use('/api/sketch',        aiLimiter, sketchRoutes);
app.use('/api/notifications', notifRoutes);

// SPA fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log('\n╔═══════════════════════════════════╗');
  console.log('║      ✦  Miré Dev Server  ✦        ║');
  console.log('╠═══════════════════════════════════╣');
  console.log(`║  App  →  http://localhost:${PORT}      ║`);
  console.log(`║  API  →  http://localhost:${PORT}/health ║`);
  console.log('╚═══════════════════════════════════╝\n');
  startCronJobs();
});

export default app;
