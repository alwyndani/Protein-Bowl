import app from './app.js';
import { env } from './config/env.js';

const PORT = parseInt(env.PORT, 10) || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Protein Bowl Server running on http://localhost:${PORT}`);
  console.log(`🔒 Environment: ${env.NODE_ENV}`);
  console.log(`🌐 API Base URL: http://localhost:${PORT}/api/v1`);
});
