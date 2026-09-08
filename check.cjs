const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    page.on('pageerror', err => {
        console.error('Page error: ', err.toString());
    });
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.error('Console error: ', msg.text());
        }
    });

    try {
        await page.goto('http://localhost:5173', { waitUntil: 'networkidle2', timeout: 5000 });
        console.log("Loaded 5173");
    } catch (e) {
        console.log("Could not load 5173, trying 5174");
        await page.goto('http://localhost:5174', { waitUntil: 'networkidle2' });
    }
    await new Promise(r => setTimeout(r, 2000));
    await browser.close();
})();
