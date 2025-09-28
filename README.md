# Symptom Checker Prototype v2

Thin-client + proxy demo that calls a medical symptom-assessment API via a small Node/Express server.

## Quick start
1) `cp .env.example .env` and fill in credentials 
2) move fiiles (`index.html`, `app.js`, `styles.css`) to a public folder
3) `npm install`  
4) `npm start`  
4) Open http://localhost:3000

## Structure
- `server.mjs`: Express proxy, secrets stay server-side
- `public/`: single-page client (`index.html`, `app.js`, `styles.css`)
- `.env.example`: config template

## Notes
- This demo intentionally runs a **single turn**.






