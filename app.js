const fileSystemInstance = require("fs");
const httpsInstance = require("https");
const path = require("path");
const readline = require("readline");
const express = require("express");

const app = express();
app.use(express.json());

//edgar에 보내는 requset option
const reqOptions = {
    headers: {
        "User-Agent": "MyCompanyName Contact@example.com",
        Accept: "application/json",
    },
};

//path 설정
const searchListedPath = path.join(
    path.resolve(__dirname),
    "search_listed.html"
);

const searchFullPath = path.join(path.resolve(__dirname), "search_full.html");

const corpDetailPath = path.join(path.resolve(__dirname), "corpDetail.html");

//페이지 get맵핑
app.get("/searchListed", (req, res) => {
    res.sendFile(searchListedPath);
});

app.get("/searchFull", (req, res) => {
    res.sendFile(searchFullPath);
});

app.get("/corpDetail", (req, res) => {
    const { cik } = req.query;
    if (!cik) {
        return res
            .status(400)
            .json({ result: false, message: "CIK is required." });
    }
    return res.sendFile(corpDetailPath);
});

//API
app.post("/searchListedCorpName", (req, res) => {
    const { keyword } = req.body;
    const corpArray = getCorpInfoByCorpName(keyword);
    return res.status(200).json({
        result: true,
        data: corpArray,
    });
});

app.post("/searchFullCorpName", (req, res) => {
    const { keyword } = req.body;
    const corpArray = getCorpInfoByCorpNameFromTxt(keyword);
    return res.status(200).json({
        result: true,
        data: corpArray,
    });
});

app.post("/searchFullCorpCik", (req, res) => {
    const { cik } = req.body;
    const corpArray = getCorpInfoByCikFromTxt(cik);
    return res.status(200).json({
        result: true,
        data: corpArray,
    });
});

app.post("/downloadOrReturnCorpJson", async (req, res) => {
    const { cik } = req.body;

    try {
        const wrappedCik = cik.toString().padStart(10, "0");
        const suffixDir = wrappedCik.slice(-2);
        const filePath = path.join(
            __dirname,
            "corpJson",
            suffixDir,
            `${wrappedCik}.json`
        );

        // 파일 존재 여부 확인
        if (fileSystemInstance.existsSync(filePath)) {
            const fileContent = fileSystemInstance.readFileSync(
                filePath,
                "utf-8"
            );
            return res
                .status(200)
                .json({ result: true, data: JSON.parse(fileContent) });
        }

        // 파일 없으면 다운로드 시도
        const downloadedPath = await downloadCorpDetail(cik);
        const downloadedContent = fileSystemInstance.readFileSync(
            downloadedPath,
            "utf-8"
        );

        return res
            .status(200)
            .json({ result: true, data: JSON.parse(downloadedContent) });
    } catch (err) {
        return res.status(500).json({
            result: false,
            error: err.message || "Download or read failed",
        });
    }
});

//함수 정의
/**
 * 입력한 corpName을 기준으로 company_tickers.json에 있는 기업 목록에서 해당 이름이 포함된 기업 정보를 모두 검색해 출력
 *
 * 추후 DB에 company_tickers.json 데이터를 저장하고, like검색을 통해 사용할 것.
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

/**
 * 입력한 corpName을 기준으로 cik-lookup-data.txt에 있는 기업 목록에서 해당 이름이 포함된 기업 정보를 모두 검색해 출력
 *
 * 추후 DB에 company_tickers.json 데이터를 저장하고, like검색을 통해 사용
 *
 * CIK를 얻기 위해 사용
 */
const getCorpInfoByCorpNameFromTxt = (keyword) => {
    const filePath = path.join(__dirname, "cik-lookup-data.txt");
    const lines = fileSystemInstance
        .readFileSync(filePath, "utf8")
        .split("\n")
        .filter(Boolean);

    const lowerKeyword = keyword.toLowerCase();
    const results = [];

    for (const line of lines) {
        const parts = line.trim().split(":").filter(Boolean); // 빈 요소 제거

        if (parts.length < 2) continue;

        const name = parts.slice(0, -1).join(":").trim();
        const cikRaw = parts[parts.length - 1].trim();

        if (!cikRaw.match(/^\d+$/)) continue; // CIK가 숫자가 아닐 경우 필터링

        if (name.toLowerCase().includes(lowerKeyword)) {
            results.push({
                title: name,
                cik: cikRaw.padStart(10, "0"),
            });
        }
    }

    return results;
};

/**
 * 입력한 cik를 기준으로 cik-lookup-data.txt에 있는 기업 목록에서 해당 cik과 일치하는 기업 정보를 검색해 출력
 *
 * 추후 DB에 company_tickers.json 데이터를 저장하고, cik = ? 형태의 정확한 검색으로 사용 가능
 *
 * 기업명을 얻기 위해 사용
 */
const getCorpInfoByCikFromTxt = (cik) => {
    const keyword = String(cik).trim();

    //유효성 검사
    const numericValue = Number(keyword);
    if (isNaN(numericValue) || numericValue < 1000) {
        return [];
    }

    const filePath = path.join(__dirname, "cik-lookup-data.txt");
    const lines = fileSystemInstance
        .readFileSync(filePath, "utf8")
        .split("\n")
        .filter(Boolean);

    const results = [];

    for (const line of lines) {
        const parts = line.trim().split(":").filter(Boolean);
        if (parts.length < 2) continue;

        const name = parts.slice(0, -1).join(":").trim();
        const cikRaw = parts[parts.length - 1].trim();

        if (!/^\d+$/.test(cikRaw)) continue;

        const paddedCik = cikRaw.padStart(10, "0");

        if (paddedCik.includes(keyword)) {
            results.push({
                title: name,
                cik: paddedCik,
            });
        }
    }

    return results;
};

const downloadCorpDetail = (cik) => {
    return new Promise((resolve, reject) => {
        try {
            const wrappedCik = cik.toString().padStart(10, "0");
            const suffixDir = wrappedCik.slice(-2);
            const url = `https://data.sec.gov/submissions/CIK${wrappedCik}.json`;
            const dirPath = path.join(__dirname, "corpJson", suffixDir);
            const dest = path.join(path.resolve(dirPath), `${wrappedCik}.json`);

            if (!fileSystemInstance.existsSync(dirPath)) {
                fileSystemInstance.mkdirSync(dirPath, { recursive: true });
            }

            httpsInstance
                .get(url, reqOptions, (res) => {
                    if (res.statusCode !== 200) {
                        console.error(`HTTP Error: ${res.statusCode}`);
                        res.resume();
                        return reject();
                    }

                    const fileStream =
                        fileSystemInstance.createWriteStream(dest);
                    res.pipe(fileStream);

                    fileStream.on("finish", () => {
                        fileStream.close();
                        console.log(`Download complete: ${wrappedCik}.json`);
                        return resolve(dest);
                    });
                })
                .on("error", (err) => {
                    console.error(`Download failed: ${err.message}`);
                    return reject();
                });
        } catch (error) {
            return reject();
        }
    });
};

const downloadDocument = async (cik, index) => {
    const wrappedCik = cik.toString().padStart(10, "0");

    const suffixDir = wrappedCik.slice(-2);

    const filePath = path.join(
        path.resolve(__dirname),
        "corpjson",
        suffixDir,
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
        "data",
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

app.listen(59247, () => {
    console.log("Server running on port 59247");
});
