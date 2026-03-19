# BP Auto-Poster

Browser automation for posting to Twitter, Reddit, Fansly, and OnlyFans.
Reads scheduled posts from Supabase and posts them using Playwright.

## Setup

```bash
cd scripts/auto-poster
npm install
npx playwright install chromium
cp .env.example .env
# Edit .env with your Supabase credentials and enable platforms
```

## First-Time Login

```bash
npm run login
```

A browser window opens for each enabled platform. Log in manually, then close the window. Sessions are saved persistently.

## Run

```bash
# One-time: post all due items now
npm run post

# Continuous: poll every 15 minutes
npm start
```

## Auto-Start on Windows

Run `setup-windows-task.bat` as administrator. The poster will start automatically when you log in.

## How It Works

1. Checks `content_posts` table for rows where `post_status = 'scheduled'` and `scheduled_at <= now`
2. Downloads media from `content_vault` if attached
3. Opens a headless browser with your saved login session
4. Navigates to the platform's compose page
5. Fills in caption, uploads media, clicks post
6. Updates `post_status = 'posted'` with timestamp and URL
