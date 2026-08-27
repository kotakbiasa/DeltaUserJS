module.exports = {
  apps: [
    {
      name: 'deltauserjs',
      script: 'src/index.ts',
      interpreter: 'bun',
      interpreter_args: 'run',
      cwd: '/root/DeltaUserJS',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      restart_delay: 3000,
      autorestart: true,
      cron_restart: '0 4 * * *', // restart harian jam 4 pagi
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: '/root/logs/deltauserjs-out.log',
      error_file: '/root/logs/deltauserjs-err.log',
      merge_logs: true,
      log_type: 'json',
    },
  ],
};