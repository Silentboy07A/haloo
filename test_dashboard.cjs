const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', msg => {
        console.log(`[${msg.type()}] ${msg.text()}`);
    });

    page.on('pageerror', exception => {
        console.log(`[uncaught exception] ${exception}`);
    });

    try {
        await page.goto('file:///C:/Users/csbal/Downloads/savehydroo/index.html', { waitUntil: 'networkidle' });
        console.log("Page loaded. Waiting for 5 seconds for dashboard to tick...");
        await page.waitForTimeout(5000);

        // Let's force a dashboard update just to see it
        await page.evaluate(async () => {
            if (window.Dashboard) {
                console.log("Mocking logged in state...");
                window.EdgeAPI.userId = '1234-real-user';
                window.Auth.isAuthenticated = true;

                console.log("Forcing Dashboard.update()...");
                await window.Dashboard.update().catch(e => console.error("Update threw error:", e));
                console.log("last-update text is:", document.getElementById('last-update').textContent);
                console.log("ro-flow text is:", document.getElementById('ro-flow').textContent);
                console.log("sim-status text is:", document.getElementById('sim-status') ? document.getElementById('sim-status').textContent : 'N/A');

                // Also test historical data load since this only runs for real users
                console.log("Testing historical data load...");
                await window.Dashboard._loadHistoricalData().catch(e => console.error("_loadHistoricalData threw error:", e));
            } else {
                console.log("Dashboard object not found globally.");
            }
        });

        await page.waitForTimeout(2000);
    } catch (e) {
        console.log("Error running test:", e);
    } finally {
        await browser.close();
    }
})();
