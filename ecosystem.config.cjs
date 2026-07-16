module.exports = {
  apps: [
    {
      name: 'dashboard-garageinn-server',
      script: 'backend/app.js',
      node_args: '--use-system-ca',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      watch: false,
    },
    {
      name: 'dashboard-garageinn-sync',
      script: 'backend/sync_continuo.js',
      node_args: '--use-system-ca',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 100,
      restart_delay: 5000,
      watch: false,
    },
  ],
};
