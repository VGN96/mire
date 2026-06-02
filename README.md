# Miré – AI-Powered Fashion Styling App

A full-stack AI fashion application that helps users organize their wardrobe, get personalized styling recommendations, generate outfit ideas, and create fashion sketches using AI.

## Features

- **Wardrobe Management** – Upload and organize your clothing items with categories and metadata
- **AI Stylist Chat** – Get personalized styling advice powered by Claude AI
- **OOTD Generation** – Generate outfit recommendations based on your wardrobe and preferences
- **Sketch Generation** – Create AI-powered fashion sketches with custom prompts and styles
- **Weather Integration** – Get styling suggestions based on current weather conditions
- **Stitch Studio** – Create fashion design briefs and collaborate on designs
- **User Authentication** – Secure JWT-based authentication with refresh tokens
- **Image Uploads** – Cloud storage integration with Cloudinary
- **Notifications** – Real-time notifications for app events
- **Responsive UI** – Single-page application with seamless mobile and desktop experience

## Tech Stack

### Backend
- **Runtime:** Node.js (ESM)
- **Framework:** Express.js
- **Database:** PostgreSQL (via Supabase)
- **ORM:** Prisma
- **Authentication:** JWT
- **AI Integration:** Anthropic Claude API
- **Image Storage:** Cloudinary
- **Testing:** Vitest

### Frontend
- **Architecture:** Single-page application (SPA)
- **Build:** HTML, CSS, JavaScript (vanilla)
- **API Communication:** Fetch API with auto-refresh token handling

## Prerequisites

- Node.js 18+ and npm
- Supabase account (PostgreSQL database)
- Anthropic API key (for AI features)
- Cloudinary account (for image uploads)
- OpenWeatherMap API key (optional, for weather features)

## Installation

### 1. Clone the repository
```bash
git clone <repository-url>
cd mire
```

### 2. Backend setup
```bash
cd backend
npm install
```

### 3. Create environment file
```bash
cp .env.example .env
```

### 4. Configure environment variables
Edit `backend/.env` with the following required variables:

| Variable | Source |
|----------|--------|
| `DATABASE_URL` | Supabase → Settings → Database → Connection string (Transaction mode) |
| `DIRECT_URL` | Supabase → Settings → Database → Connection string (Session mode) |
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → service_role key |
| `JWT_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `CLOUDINARY_CLOUD_NAME` | cloudinary.com → Settings |
| `CLOUDINARY_API_KEY` | cloudinary.com → Settings |
| `CLOUDINARY_API_SECRET` | cloudinary.com → Settings |
| `WEATHER_API_KEY` | openweathermap.org (optional) |

### 5. Initialize database
```bash
npx prisma generate
npx prisma db push
```

### 6. Start development server
```bash
npm run dev
```

The application will be available at **http://localhost:4000**

## Graceful Degradation

The app works seamlessly even without optional services:

- **No ANTHROPIC_API_KEY** – Chat returns a message to add the key; app continues working
- **No CLOUDINARY keys** – Image uploads are skipped; items save without photos
- **No WEATHER_API_KEY** – Returns mock weather data (34°C, Sunny)

## Project Structure

```
mire/
├── backend/                    ← Express API server
│   ├── src/
│   │   ├── index.js           ← Main server entry point
│   │   ├── config/db.js       ← Prisma client configuration
│   │   ├── middleware/
│   │   │   ├── auth.js        ← JWT authentication
│   │   │   └── errorHandler.js ← Error handling
│   │   ├── routes/            ← API endpoints
│   │   │   ├── auth.js
│   │   │   ├── user.js
│   │   │   ├── wardrobe.js
│   │   │   ├── stylist.js
│   │   │   ├── stitch.js
│   │   │   ├── sketch.js
│   │   │   ├── weather.js
│   │   │   ├── notifications.js
│   │   │   └── outfit.js
│   │   ├── services/
│   │   │   ├── cloudinaryService.js
│   │   │   └── cronService.js
│   │   └── __tests__/         ← Test suite
│   ├── prisma/
│   │   └── schema.prisma      ← Database schema
│   └── package.json
└── frontend/
    └── index.html             ← Complete SPA frontend
```

## API Endpoints

### Authentication (Public)
```
POST   /api/auth/signup      → { name, email, password, city? }
POST   /api/auth/login       → { email, password }
POST   /api/auth/refresh     → { refreshToken }
POST   /api/auth/logout      → { refreshToken }
```

### User (Protected)
```
GET    /api/user/me          ← Get current user
PATCH  /api/user/me          ← Update user profile
```

### Wardrobe (Protected)
```
GET    /api/wardrobe         ← List items (?category=&search=&sort=)
POST   /api/wardrobe         ← Add new item (multipart/form-data)
PATCH  /api/wardrobe/:id/worn ← Mark item as worn
DELETE /api/wardrobe/:id     ← Delete item
```

### AI Stylist (Protected)
```
POST   /api/stylist/chat     → { message, sessionId? }
POST   /api/stylist/ootd     ← Generate outfit of the day
```

### Design Studio (Protected)
```
POST   /api/stitch/briefs    ← Create design brief
GET    /api/stitch/briefs    ← Get design briefs
POST   /api/sketch/generate  → { prompt, style, type? }
```

### Notifications (Protected)
```
GET    /api/notifications    ← Get notifications
PATCH  /api/notifications/:id/read ← Mark as read
```

### Public
```
GET    /health               ← Health check
GET    /api/weather?city=    ← Get weather (public)
```

**Protected routes require:** `Authorization: Bearer <jwt-token>` header

## Usage

### Running Tests
```bash
npm run test
```

### Database Management
```bash
# View database in Prisma Studio
npx prisma studio

# Push schema changes to Supabase
npx prisma db push

# Regenerate Prisma client after schema changes
npx prisma generate
```

### Frontend
- The frontend is served by the backend at `/`
- All API calls use `const API = ''` (same-origin, no CORS)
- Auth tokens stored in localStorage: `mt` (token), `mr` (refresh), `mu` (user)
- Auto token-refresh on 401 responses

## Deployment

### Deploy to Render.com

1. Push code to GitHub
2. Connect repository to Render.com
3. Configure deployment settings:
   - **Build Command:** `npm install && npx prisma generate`
   - **Start Command:** `node src/index.js`
4. Add environment variables in Render dashboard
5. Update `API` constant in `frontend/index.html` to your Render URL
6. Deploy!

### Deploy to Vercel/Netlify/Other

Since this is an Express-based full-stack app, you'll need a platform that supports Node.js backends. Render, Railway, Heroku, or similar PaaS are recommended.

## Development

### Code Structure
- All backend code uses ES modules (ESM)
- Prisma for type-safe database access
- Middleware-based request handling
- Service layer for external integrations

### Adding New Endpoints
1. Create a new route file in `src/routes/`
2. Import and use in `src/index.js`
3. Add tests in `src/__tests__/`
4. Update database schema in `prisma/schema.prisma` if needed

## Troubleshooting

### Database Connection Issues
- Ensure `DATABASE_URL` and `DIRECT_URL` are set correctly
- Verify Supabase project is active
- Run `npx prisma db push` to sync schema

### Image Upload Fails
- Verify Cloudinary credentials are correct
- Check image file size and format
- App will continue without images if credentials are missing

### AI Features Not Working
- Verify `ANTHROPIC_API_KEY` is set
- Check API key has appropriate permissions
- App provides fallback messages

## Environment Variables Reference

```bash
# Database (Required)
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Supabase (Required)
SUPABASE_URL=https://...supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...

# Authentication (Required)
JWT_SECRET=<64-character hex string>

# AI (Optional)
ANTHROPIC_API_KEY=sk-...

# Image Storage (Optional)
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Weather (Optional)
WEATHER_API_KEY=...
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

---

**Built with ✨ for fashion enthusiasts and AI lovers**
