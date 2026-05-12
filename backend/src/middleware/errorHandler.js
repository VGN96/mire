export function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  console.error(`[${status}] ${req.method} ${req.path} — ${err.message}`);
  if (err.code === 'P2002') return res.status(409).json({ error: 'Already exists' });
  if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV === 'development' && { detail: err.message }),
  });
}
