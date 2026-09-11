import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const types = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

createServer((request, response) => {
  const requested = normalize(decodeURIComponent(request.url.split('?')[0])).replace(/^([/\\])+/, '');
  let file = join(directory, requested || 'index.html');
  if (!file.startsWith(directory) || !existsSync(file)) file = join(directory, 'index.html');
  response.writeHead(200, { 'Content-Type': `${types[extname(file)] || 'application/octet-stream'}; charset=utf-8` });
  createReadStream(file).pipe(response);
}).listen(5174, '127.0.0.1', () => console.log('Z Social web running on http://127.0.0.1:5174'));
