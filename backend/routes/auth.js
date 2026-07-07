import express from 'express';
import { requireAuth } from '../lib/auth-middleware.js';

const router = express.Router();

router.get('/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

export default router;
