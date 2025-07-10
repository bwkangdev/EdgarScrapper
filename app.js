const fileSystemInstance = require("fs");
const httpsInstance = require("https");
const path = require("path");
const stringSimilarity = require("string-similarity");
const express = require("express");

const app = express();
app.use(express.json());

//정적파일 라우팅
const publicPath = path.join(path.resolve(__dirname), "public");
app.use("/res", express.static(publicPath));

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

app.post("/getStateData", async (req, res) => {
    const { corpName, stateCode } = req.body;
    let result;
    if (stateCode === "NY") {
        result = await getDataFromNYGov(corpName);
    } else {
        result = { result: false, errorMessage: "unsupported state" };
    }
    return res.status(200).json(result);
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

const getDataFromNYGov = async (corpName) => {
    //반환할 객체
    let result = { result: false };
    //접미어 제거
    const normalizedCorpname = normalizeCorpname(corpName);
    let corpList;

    try {
        //접미어 제거된 사업자명으로 검색 실행
        const corpListResponse = await fetch(
            "https://apps.dos.ny.gov/PublicInquiryWeb/api/PublicInquiry/GetComplexSearchMatchingEntities",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    searchValue: normalizedCorpname,
                    searchByTypeIndicator: "EntityName",
                    searchExpressionIndicator: "BeginsWith",
                    entityStatusIndicator: "AllStatuses",
                    entityTypeIndicator: [
                        "Corporation",
                        "LimitedLiabilityCompany",
                        "LimitedPartnership",
                        "LimitedLiabilityPartnership",
                    ],
                    listPaginationInfo: {
                        listStartRecord: 1,
                        listEndRecord: 50,
                    },
                }),
            }
        );
        const data = await corpListResponse.json();
        if (
            data.requestStatus !== "Success" ||
            data.resultIndicator === "NoEntityMatchFound"
        ) {
            result.errorMessage = "entity not found";
            return result;
        }
        corpList = data.entitySearchResultList;
    } catch (error) {
        result.errorMessage = "internal server error requesting corp list";
        return result;
    }

    let bestMatchedOne = null;
    let highestScore = 0;

    try {
        for (const eachCorp of corpList) {
            const entityName = eachCorp.entityName;
            const score = stringSimilarity.compareTwoStrings(
                corpName.toLowerCase(),
                entityName.toLowerCase()
            );
            if (score >= highestScore) {
                highestScore = score;
                bestMatchedOne = eachCorp;
            }
        }
        console.log(
            `corpName from edgar: ${corpName}\ncorpName from NY gov: ${bestMatchedOne.entityName}\nmatchRate: ${highestScore}`
        );
        result.matchRate = highestScore;
        if (!bestMatchedOne) {
            result.errorMessage = "no match found";
            return result;
        }
    } catch (error) {
        result.errorMessage = "internal server error matching corp name";
        return result;
    }

    try {
        const detailResponse = await fetch(
            "https://apps.dos.ny.gov/PublicInquiryWeb/api/PublicInquiry/GetEntityRecordByID",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    SearchID: bestMatchedOne.dosID,
                    EntityName: bestMatchedOne.entityName,
                    AssumedNameFlag: "false",
                }),
            }
        );
        const detailData = await detailResponse.json();

        if (
            detailData.requestStatus !== "Success" ||
            detailData.resultIndicator !== "EntityMatchFound"
        ) {
            result.errorMessage = "can not get detailed data";
            return result;
        }
        result.result = true;
        result.corpInfo = detailData;
    } catch (error) {
        result.errorMessage = "internal server error fetching detailed data";
        return result;
    }
    return result;
};

const normalizeCorpname = (corpName) => {
    if (!corpName) return "";

    const suffixes = [
        "inc.",
        "inc",
        "incorporated",
        "corp",
        "corporation",
        "llc",
        "l.l.c.",
        "ltd",
        "limited",
        "co.",
        "co",
        "company",
        "lp",
        "llp",
        "plc",
        "liability",
    ];

    let result = corpName.trim().toLowerCase();

    // 접미사 제거
    suffixes.forEach((suffix) => {
        const regex = new RegExp(`\\b${suffix}\\b`, "gi");
        result = result.replace(regex, "");
    });

    // 공백 정리
    result = result.replace(/[.,]+/g, " ").replace(/\s+/g, " ").trim();

    return result;
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
