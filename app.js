const fileSystemInstance = require("fs");
const httpsInstance = require("https");
const path = require("path");
const readline = require("readline");
const express = require("express");

const app = express();
app.use(express.json());

const reqOptions = {
    headers: {
        "User-Agent": "MyCompanyName Contact@example.com",
        Accept: "application/json",
    },
};

const searchPath = path.join(path.resolve(__dirname), "search.html");
app.get("/search", (req, res) => {
    res.sendFile(searchPath);
});

app.post("/searchCorpName", (req, res) => {
    const { keyword } = req.body;
    const corpArray = getCorpInfoByCorpName(keyword);
    return res.status(200).json({
        result: true,
        data: corpArray,
    });
});
/**
 * 입력한 corpName을 기준으로 company_tickers.json에 있는 기업 목록에서 해당 이름이 포함된 기업 정보를 모두 검색해 출력
 *
 * 추후 DB에 company_tickers.json 데이터를 저장하고, like검색을 통해 사용
 *
 * Ticker와 CIK를 얻기 위해 사용
 */
const getCorpInfoByCorpName = (keyword) => {
    const filePath = path.join(path.resolve(__dirname), "company_tickers.json");
    const data = JSON.parse(fileSystemInstance.readFileSync(filePath, "utf8"));
    const companies = Object.values(data);

    const lowerKeyword = keyword.toLowerCase();

    const results = companies.filter((company) =>
        company.title.toLowerCase().includes(lowerKeyword)
    );

    return results.map((company) => ({
        title: company.title,
        ticker: company.ticker,
        cik: company.cik_str.toString().padStart(10, "0"),
    }));
};

const downloadCorpDetail = (cik) => {
    const wrappedCik = cik.toString().padStart(10, "0");
    const url = `https://data.sec.gov/submissions/CIK${wrappedCik}.json`;
    const dest = path.join(
        path.resolve(__dirname),
        "corpJson",
        `${wrappedCik}.json`
    );

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
                console.log(`Download complete: ${wrappedCik}.json`);
            });
        })
        .on("error", (err) => {
            console.error(`Download failed: ${err.message}`);
        });
};

const downloadDocument = async (cik, index) => {
    const wrappedCik = cik.toString().padStart(10, "0");

    const filePath = path.join(
        path.resolve(__dirname),
        "corpjson",
        `${wrappedCik}.json`
    );

    const data = JSON.parse(fileSystemInstance.readFileSync(filePath, "utf8"));

    const accessionNo = data.filings.recent.accessionNumber[index].replaceAll(
        "-",
        ""
    );
    const documentNo = data.filings.recent.primaryDocument[index];

    const fileDest = path.join(
        path.resolve(__dirname),
        wrappedCik,
        accessionNo,
        documentNo
    );
    const dirOfFile = path.dirname(fileDest);

    try {
        await fileSystemInstance.promises.mkdir(dirOfFile, { recursive: true });

        const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNo}/${documentNo}`;

        const fileStream = fileSystemInstance.createWriteStream(fileDest);

        httpsInstance
            .get(url, reqOptions, (res) => {
                if (res.statusCode !== 200) {
                    console.error(`HTTP Error: ${res.statusCode}`);
                    res.resume();
                    return;
                }

                res.pipe(fileStream);

                fileStream.on("finish", () => {
                    fileStream.close();
                    console.log(`Download complete: ${fileDest}`);
                });
            })
            .on("error", (err) => {
                console.error(`Download failed: ${err.message}`);
            });
    } catch (err) {
        console.error("Directory creation or file stream error:", err.message);
    }
};

// downloadDocument(320193, 2);

app.listen(3000);
