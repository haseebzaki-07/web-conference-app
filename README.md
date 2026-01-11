# MeetFlow

Video conferencing application with backend API and frontend Next.js app. Features WebRTC peer-to-peer video calls, WebSocket signaling, and room management.

## Prerequisites

- Node.js (v18 or higher)
- npm
- Database (PostgreSQL/Neon - configured via `DATABASE_URL`)

## Tech Stack

**Backend:**

- Hono (web framework)
- WebSocket (signaling server)
- Prisma ORM
- TypeScript

**Frontend:**

- Next.js 16
- React 19
- NextAuth
- Tailwind CSS
- WebRTC

## Setup

### Backend

1. Navigate to the backend directory:

```bash
cd backend
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables (create a `.env` file) or copy from .env.example:

```bash
DATABASE_URL=your_database_url
```

4. Start the development server:

```bash
npm run dev
```

### Frontend (conference-app)

1. Navigate to the conference-app directory:

```bash
cd conference-app
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables (create a `.env` file) or copy from .env.example:

```bash
DATABASE_URL=your_database_url
```

4. Start the development server:

```bash
npm run dev
```

The frontend will be available at [http://localhost:3000](http://localhost:3000).

## Project Structure

- `backend/` - Hono API server with WebSocket signaling
- `conference-app/` - Next.js frontend application
