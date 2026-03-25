import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const url = args[0];
if (!url) {
  console.error('Usage: node screenshot.mjs <url> [label] [--width=N] [--height=N] [--full]');
  process.exit(1);
}

let label = null;
let width = 1440;
let height = 900;
let fullPage = false;

for (const a of args.slice(1)) {
  if (a.startsWith('--width='))  width    = parseInt(a.split('=')[1]);
  else if (a.startsWith('--height=')) height = parseInt(a.split('=')[1]);
  else if (a === '--full')        fullPage = true;
  else if (!a.startsWith('--'))   label    = a;
}

const screenshotDir = path.join(__dirname, 'temporary screenshots');
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

const existing = fs.readdirSync(screenshotDir).filter(f => f.match(/^screenshot-\d/));
const nums = existing.map(f => parseInt(f.match(/^screenshot-(\d+)/)?.[1] || '0')).filter(n => !isNaN(n));
const next = nums.length ? Math.max(...nums) + 1 : 1;
const filename = label ? `screenshot-${next}-${label}.png` : `screenshot-${next}.png`;
const outputPath = path.join(screenshotDir, filename);

const CHROME = 'C:/Users/execu/.cache/puppeteer/chrome/win64-146.0.7680.31/chrome-win64/chrome.exe';

const browser = await puppeteer.launch({
  headless: true,
  executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({ width, height });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
await page.screenshot({ path: outputPath, fullPage });
await browser.close();

console.log(`Screenshot saved: ${outputPath}`);
