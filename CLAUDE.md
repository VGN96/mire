# Miré — Instructions for Claude Code

Full-stack AI fashion app. Express backend + single HTML frontend.

## Project structure

```
mire/
├── backend/          ← Express API (Node.js ESM)
│   ├── src/
│   │   ├── index.js          ← main server (serves frontend at /)
│   │   ├── config/db.js      ← Prisma client
│   │   ├── middleware/       ← auth.js, errorHandler.js
│   │   ├── routes/           ← auth, user, wardrobe, stylist, stitch, sketch, weather, notifications
│   │   └── services/         ← cloudinaryService.js, cronService.js
│   └── prisma/schema.prisma
└── frontend/
    └── index.html    ← complete SPA (all screens + JS)
```

## Quick start (run in order)

```bash
cd backend
npm install
cp .env.example .env          # then fill in your keys
npx prisma generate
npx prisma db push            # pushes schema to Supabase
npm run dev                   # starts at http://localhost:4000
```

Open browser → http://localhost:4000 → you'll see the app.

## Environment variables needed

All go in `backend/.env`:

| Key | Where to get |
|-----|-------------|
| DATABASE_URL | Supabase → Settings → Database → Connection string (Transaction mode) |
| DIRECT_URL | Supabase → Settings → Database → Connection string (Session mode) |
| SUPABASE_URL | Supabase → Settings → API |
| SUPABASE_ANON_KEY | Supabase → Settings → API |
| SUPABASE_SERVICE_KEY | Supabase → Settings → API → service_role key |
| JWT_SECRET | Run: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| ANTHROPIC_API_KEY | console.anthropic.com |
| CLOUDINARY_CLOUD_NAME | cloudinary.com → dashboard |
| CLOUDINARY_API_KEY | cloudinary.com → dashboard |
| CLOUDINARY_API_SECRET | cloudinary.com → dashboard |
| WEATHER_API_KEY | openweathermap.org (optional — mock data works without it) |

## Graceful degradation (works without optional keys)

- **No ANTHROPIC_API_KEY** → Chat returns a friendly message to add the key. App still works.
- **No CLOUDINARY keys** → Image upload is skipped. Items save without photos.
- **No WEATHER_API_KEY** → Returns mock data (34°C, Rajkot, Sunny).

## API endpoints

All protected routes require `Authorization: Bearer <token>` header.

### Auth (public)
- `POST /api/auth/signup` → `{ name, email, password, city? }`
- `POST /api/auth/login`  → `{ email, password }`
- `POST /api/auth/refresh` → `{ refreshToken }`
- `POST /api/auth/logout`  → `{ refreshToken }`

### Protected
- `GET/PATCH /api/user/me`
- `GET /api/wardrobe` → `?category=&search=&sort=`
- `POST /api/wardrobe` → multipart/form-data with optional `image` file
- `PATCH /api/wardrobe/:id/worn`
- `DELETE /api/wardrobe/:id`
- `POST /api/stylist/chat` → `{ message, sessionId? }`
- `POST /api/stylist/ootd`
- `POST /api/stitch/briefs`
- `GET /api/stitch/briefs`
- `POST /api/sketch/generate` → `{ prompt, style, type? }`
- `GET /api/notifications`
- `PATCH /api/notifications/:id/read`

### Public
- `GET /health`
- `GET /api/weather?city=Rajkot`

## Database

Prisma + Supabase PostgreSQL. After changing `schema.prisma`:

```bash
npx prisma db push      # apply to Supabase
npx prisma generate     # regenerate client
npx prisma studio       # visual DB browser at localhost:5555
```

## How the frontend works

- Single HTML file at `frontend/index.html`
- Backend serves it statically at `http://localhost:4000`
- `const API = ''` (same origin, no CORS)
- Auth: JWT in localStorage (`mt`=token, `mr`=refresh, `mu`=user JSON)
- Auto token-refresh on 401 responses
- All screens: splash → signup/login → onboarding → home → wardrobe → addItem → stylist → profile → stitch studio → sketch

## Deploy to production

1. Push to GitHub
2. Connect to Render.com
3. Set build command: `npm install && npx prisma generate`
4. Set start command: `node src/index.js`
5. Add all env vars in Render dashboard
6. Update `API` constant in `frontend/index.html` to your Render URL
