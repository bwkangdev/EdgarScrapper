const httpsInstance = require("https");
const fileSystemInstance = require("fs");
const path = require("path");

const url = "https://www.sec.gov/Archives/edgar/cik-lookup-data.txt";
const dest = path.join(path.resolve(__dirname), "cik-lookup-data.txt");

const reqOptions = {
    headers: {
        "User-Agent": "MyCompanyName Contact@example.com",
        Accept: "application/json",
    },
};

httpsInstance
    .get(url, reqOptions, (res) => {
        if (res.statusCode !== 200) {
            console.error(`HTTP Error: ${res.statusCode}`);
            res.resume();
            return;
        }

        const fileStream = fileSystemInstance.createWriteStream(dest);
        res.pipe(fileStream);

        fileStream.on("finish", () => {
            fileStream.close();
            console.log("Download complete: cik-lookup-data.txt");
        });
    })
    .on("error", (err) => {
        console.error(`Download failed: ${err.message}`);
    });
