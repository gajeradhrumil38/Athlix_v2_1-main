# Athlix - Personal Gym Activity Tracker

Athlix is a mobile-first, tablet-friendly personal gym activity tracker built with React, Tailwind CSS, and Supabase.

## Setup Instructions

### 1. Supabase Setup
1. Create a new project on [Supabase](https://supabase.com/).
2. Go to the **SQL Editor** in your Supabase dashboard.
3. Copy the contents of `supabase/schema.sql` and run it to create the necessary tables, policies, and triggers.
4. Go to **Authentication > Providers** and ensure Email provider is enabled.

### 2. Environment Variables
1. In your AI Studio environment, open the **Secrets** panel (or `.env` file if running locally).
2. Add the following environment variables:
   - `VITE_SUPABASE_URL`: Your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase Project API Key (anon/public)

### 3. Running the App
The app should automatically build and run in the AI Studio environment. If running locally:
```bash
npm install
npm run dev
```

## Features
- **Auth**: Email/password login and signup via Supabase.
- **Home Dashboard**: Quick stats, weekly activity ring, and recent workouts.
- **Workout Logger**: Log daily sessions with exercises, sets, reps, and weights.
- **Templates System**: Create and load reusable workout templates.
- **Calendar View**: Monthly calendar highlighting workout days.
- **Timeline / History**: Chronological feed of past workouts.
- **Settings**: Profile edit, unit preference, theme toggle, and Whoop integration placeholder.
