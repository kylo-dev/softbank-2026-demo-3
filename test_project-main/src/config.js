export function loadConfig(env = process.env) {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid configuration: PORT must be an integer between 1 and 65535');
  }
  return {
    port,
    host: env.HOST || '0.0.0.0',
    title: env.APP_TITLE?.trim() || '작은 완료',
  };
}
