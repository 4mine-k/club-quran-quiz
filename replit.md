# Club Quran ENSIAS quiz

## Running on Replit
- Click **Run** to start the **Start application** workflow.
- Command: `PORT=5000 node server.js`.
- The server listens on `0.0.0.0:5000`; view the app in Replit's Preview.
- Node.js 18 or newer is required. There are no external packages to install and no secrets or external services are required.
- Outside Replit, `npm start` continues to use port 3000 unless `PORT` is set.

## Pages
- `/`: Arabic, right-to-left quiz.
- `/join`: shareable quiz link and QR code.
- `/admin`: participant results and Excel export.
- `/export.xlsx` and `/export.csv`: downloadable results.

## Existing storage and access
- Keep the existing plain Node.js, HTML/CSS/JavaScript structure.
- Participant results are stored in `data/players.json`. Do not delete or reset this file as part of setup or testing.
- The admin page, participant results API, and exports are currently public, without authentication. Protect these before sharing sensitive participant information.
- This setup runs the imported app in development; it does not publish it or change its storage system.
