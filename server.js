// Local development / long-running server entry point.
// On Vercel, api/index.js imports the Express app directly as a serverless function.
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MediCare HMS running at http://localhost:${PORT}`);
});
