// pm2 config for a plain VPS without Docker. From keeper/, after `pnpm install --prod`:
//
//   pm2 start ecosystem.config.cjs     keeper + bots, env from keeper/.env
//   pm2 logs                           follow both
//   pm2 save && pm2 startup            survive reboots
//
// Node loads keeper/.env itself (--env-file-if-exists), so pm2 needs no env block.
const app = (name, script) => ({
  name: `lastflag-${name}`,
  script,
  cwd: __dirname,
  interpreter: 'node',
  node_args: ['--env-file-if-exists=.env'],
  autorestart: true,
  exp_backoff_restart_delay: 1000,
  time: true,
});

module.exports = {
  apps: [app('keeper', 'src/keeper.ts'), app('bots', 'src/bots.ts')],
};
