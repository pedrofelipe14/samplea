// Arma dist/samplea-<versión>.zip con lo necesario para subir a la Chrome Web Store / Edge Add-ons.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
const out = `dist/samplea-${version}.zip`;
mkdirSync('dist', { recursive: true });
rmSync(out, { force: true });
const files = ['manifest.json', 'src', 'icons/icon16.png', 'icons/icon32.png', 'icons/icon48.png', 'icons/icon128.png'];
execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path ${files.map((f) => `'${f}'`).join(',')} -DestinationPath '${out}'`], { stdio: 'inherit' });
console.log(out);
