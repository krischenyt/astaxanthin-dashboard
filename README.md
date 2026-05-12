# Astaxanthin Dashboard

## Netlify Environment Variables
Add these in Netlify → Project configuration → Environment variables:

  VITE_SUPABASE_URL        = https://xxxx.supabase.co
  VITE_SUPABASE_ANON_KEY   = eyJh...

## File structure
astaxanthin-dashboard/
├── index.html
├── vite.config.js
├── package.json
├── netlify.toml
└── src/
    ├── main.jsx
    ├── App.jsx
    └── supabase.js
