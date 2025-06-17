// const express = require("express");
// const app = express();
async function getCikByTicker(ticker) {
    const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
        headers: {
            "User-Agent": "MyCompanyName MyAppName (myemail@example.com)",
        },
    });

    const data = await res.json();
    const companies = Object.values(data);
    const match = companies.find(
        (entry) => entry.ticker.toLowerCase() === ticker.toLowerCase()
    );

    if (match) {
        return String(match.cik_str).padStart(10, "0");
    }

    return null;
}

getCikByTicker("AAPL").then(console.log);
