const fileSystemInstance = require("fs");
const httpsInstance = require("https");
const path = require("path");
const readline = require("readline");

const reqOptions = {
    headers: {
        "User-Agent": "MyCompanyName Contact@example.com",
        Accept: "application/json",
    },
};

/**
 * 입력한 corpName을 기준으로 company_tickers.json에 있는 기업 목록에서 해당 이름이 포함된 기업 정보를 모두 검색해 출력
 *
 * 추후 DB에 company_tickers.json 데이터를 저장하고, like검색을 통해 사용
 *
 * Ticker와 CIK를 얻기 위해 사용
 */
const getCorpInfoByCorpName = () => {
    const filePath = path.join(path.resolve(__dirname), "company_tickers.json");
    const data = JSON.parse(fileSystemInstance.readFileSync(filePath, "utf8"));
    const companies = Object.values(data);
    const readLineInstance = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    readLineInstance.question("corp name input: ", (input) => {
        const keyword = input.toLowerCase();

        const results = companies.filter((company) =>
            company.title.toLowerCase().includes(keyword)
        );

        if (results.length > 0) {
            console.log(`\n 총 ${results.length}건 검색됨:\n`);
            results.forEach((company, index) => {
                console.log(`[${index + 1}]`);
                console.log(`기업명 : ${company.title}`);
                console.log(`Ticker  : ${company.ticker}`);
                console.log(`CIK     : ${company.cik_str}\n`);
            });
        } else {
            console.log("\n 해당 기업명을 찾을 수 없습니다.");
        }

        readLineInstance.close();
    });
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

downloadDocument(320193, 2);
