// Vercel serverless entrypoint — wraps the Express app.
// Fluid compute keeps the function warm up to maxDuration (see vercel.json).
const app = require('../server');
module.exports = (req, res) => app(req, res);
