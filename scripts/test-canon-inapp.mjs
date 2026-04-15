/**
 * In-app canon search test using Playwright.
 * The app defaults to ABC notation mode with a pre-filled subject,
 * so no file upload is needed — just switch to Canon view and search.
 */
import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true,
});

const page = await browser.newPage();

const pageErrors = [];
const IGNORE = ['ERR_CERT', 'tailwind is not defined', '404', 'favicon'];
page.on('console', msg => {
    if (msg.type() === 'error') {
        const t = msg.text();
        if (!IGNORE.some(s => t.includes(s))) pageErrors.push(t);
    }
    if (msg.type() === 'log') process.stdout.write('[browser] ' + msg.text() + '\n');
});
page.on('pageerror', err => {
    if (!IGNORE.some(s => err.message.includes(s))) pageErrors.push(err.message);
});

// 1. Load the app
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
console.log('App loaded. Title:', await page.title());

// 2. The app starts in ABC mode with a default subject already filled in.
//    Confirm the textarea is present.
const textarea = page.locator('textarea').first();
await textarea.waitFor({ timeout: 5000 });
const abcContent = await textarea.inputValue();
console.log('ABC subject present:', abcContent.slice(0, 50).replace(/\n/g, ' '));

// 3. Switch to Canon view
const canonTab = page.locator('button:has-text("Canon")');
await canonTab.waitFor({ timeout: 5000 });
await canonTab.click();
console.log('Switched to Canon view.');

// 4. Confirm search panel is visible
await page.waitForSelector('button:has-text("Run Canon Search")', { timeout: 5000 });
console.log('Canon search panel visible.');

// 5. Set a tight delay range (1–2b) so the search completes quickly
const numInputs = page.locator('input[type="number"]');
// First two number inputs in the Delay Range section are Min and Max
await numInputs.nth(0).fill('1');
await numInputs.nth(0).press('Tab');
await numInputs.nth(1).fill('2');
await numInputs.nth(1).press('Tab');
console.log('Delay range set to 1–2b.');

// 6. Run the search
await page.locator('button:has-text("Run Canon Search")').click();
console.log('Search started.');

// 7. Confirm the button goes into "searching" state
await page.waitForSelector('button:has-text("Scoring combinations")', { timeout: 4000 });
console.log('Button shows "Scoring combinations…" — UI is in searching state.');

// 8. Wait for search to finish (button re-enables, up to 30 s)
await page.waitForSelector('button:has-text("Run Canon Search"):not([disabled])', { timeout: 30000 });
console.log('Search finished — button re-enabled.');

// 9. Check for results
// The results list uses interval-family group headers (collapsible buttons)
const groupHeaders = await page.locator('button').filter({ hasText: /variant|family|chain/ }).count();
console.log('Group header buttons found:', groupHeaders);

// Broadest check: any rendered result row
const resultRows = await page.locator('.cursor-pointer.border-b').count();
console.log('Result rows rendered:', resultRows);

if (resultRows === 0 && groupHeaders === 0) {
    // Grab whatever text is in the results area for diagnostics
    const resultsArea = await page.locator('div.overflow-y-auto').first().innerText().catch(() => '(none)');
    console.error('FAIL: No results rendered. Results area text:', resultsArea.slice(0, 200));
    await browser.close();
    process.exit(1);
}

// 10. Click the first result row and check that the play/download bar appears
const firstRow = page.locator('.cursor-pointer.border-b').first();
await firstRow.click();
console.log('Clicked first result.');

const actionBar = page.locator('button:has-text("Play"), button:has-text("▶")');
const actionBarVisible = await actionBar.first().isVisible().catch(() => false);
console.log('Play button visible after selection:', actionBarVisible);

// 11. Report page errors
if (pageErrors.length > 0) {
    console.error('\nPage JS errors:');
    pageErrors.forEach(e => console.error('  ', e));
    await browser.close();
    process.exit(1);
}

console.log('\n✓ In-app canon search test PASSED.');
await browser.close();
