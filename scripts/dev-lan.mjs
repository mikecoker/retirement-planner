import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';

const DEFAULT_PORT = '5173';

const args = process.argv.slice(2);

function readPort(argv) {
  const portArg = argv.find((arg) => arg.startsWith('--port='));
  if (portArg) return portArg.split('=')[1] || DEFAULT_PORT;

  const portIndex = argv.indexOf('--port');
  if (portIndex >= 0 && argv[portIndex + 1]) return argv[portIndex + 1];

  return process.env.PORT || DEFAULT_PORT;
}

function hasArg(argv, name) {
  return argv.includes(name) || argv.some((arg) => arg.startsWith(`${name}=`));
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => address.address);
}

const port = readPort(args);
const viteArgs = ['vite', '--host', '0.0.0.0'];

if (!hasArg(args, '--port')) {
  viteArgs.push('--port', port);
}

if (!hasArg(args, '--strictPort')) {
  viteArgs.push('--strictPort');
}

viteArgs.push(...args);

const addresses = lanAddresses();

console.log('\nLAN dev server');
console.log(`  Local:   http://localhost:${port}/`);
if (addresses.length > 0) {
  for (const address of addresses) {
    console.log(`  Network: http://${address}:${port}/`);
  }
  console.log('\nOpen a Network URL on an iPad connected to the same Wi-Fi network.');
} else {
  console.log('  Network: no active IPv4 LAN address found');
}
console.log('Stop the server with Ctrl-C; the port is released when Vite exits.\n');

const child = spawn('npx', viteArgs, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
