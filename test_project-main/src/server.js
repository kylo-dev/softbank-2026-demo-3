import { loadConfig } from './config.js';
import { createApp } from './app.js';

try {
  const config = loadConfig();
  const server = createApp(config);
  server.on('error', error => {
    console.error(new Date().toISOString(), '[startup-error]', error.stack);
    process.exitCode = 1;
  });
  server.listen(config.port, config.host, () => {
    console.log(new Date().toISOString(), '[ready]', `IRIS demo listening on ${config.host}:${config.port}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      console.log(new Date().toISOString(), '[shutdown]', signal);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 5000).unref();
    });
  }
} catch (error) {
  console.error(new Date().toISOString(), '[startup-error]', error.stack);
  process.exitCode = 1;
}
