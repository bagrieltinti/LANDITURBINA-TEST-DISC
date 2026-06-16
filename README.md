<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/8e7f7908-ae6a-4e07-8bba-20c5d78d7cfb

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Configure `.env.local` using [.env.example](.env.example). The app needs Firebase Admin credentials and `ADMIN_SESSION_SECRET` for secure server-side reads/writes and `/admin`.
3. Run the app:
   `npm run dev`

## Admin

Open `/admin` after deploying or running locally. On first access, create the dashboard password. After that, access is protected by an HTTP-only session cookie and all test data is read through server-side API routes.
