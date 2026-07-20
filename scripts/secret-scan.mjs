import { execFileSync } from 'node:child_process';

let output = '';
try {
  output = execFileSync(
    'rg',
    [
      '-n',
      '--hidden',
      '-g',
      '!node_modules/**',
      '-g',
      '!package-lock.json',
      '-g',
      '!.git/**',
      '(sk-[A-Za-z0-9_-]{20,}|OPENAI_API_KEY\\s*=\\s*[A-Za-z0-9_-]{20,})',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
} catch (error) {
  if (error.status !== 1) throw error;
}

const unsafe = output
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((line) => !line.includes('.env.example'))
  .filter((line) => !line.includes('secret-scan.mjs'));

if (unsafe.length) {
  console.error('Potential OpenAI secret found:\n' + unsafe.join('\n'));
  process.exit(1);
}
console.log('Secret scan passed.');
