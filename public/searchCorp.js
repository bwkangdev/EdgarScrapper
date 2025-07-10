document.addEventListener("DOMContentLoaded", () => {
    const corpNameInput = document.getElementById(
        "edgarscrapper-searchcorp-corpname-input"
    );
    const searchBtn = document.getElementById(
        "edgarscrapper-searchcorp-button-search"
    );
    const tableBody = document.getElementById(
        "edgarscrapper-searchcorp-result-table-body"
    );

    const paramSelector = document.getElementById(
        "edgarscrapper-searchcorp-select"
    );
    let selectedParam = paramSelector.value;

    //검색기준 변경
    paramSelector.addEventListener("change", () => {
        selectedParam = paramSelector.value;
        corpNameInput.placeholder = selectedParam;
    });

    //검색 시행 및 결과 렌더링
    const searchCorpName = async () => {
        try {
            const inputValue = corpNameInput.value.trim();
            let searchCorpResult;
            switch (selectedParam) {
                case "corp name":
                    searchCorpResult = await fetch("./searchFullCorpName", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            keyword: inputValue,
                        }),
                    });
                    break;
                case "CIK":
                    const cikNum = Number(inputValue);
                    if (isNaN(cikNum) || cikNum < 1000) {
                        alert("1000 이상의 수를 입력해주세요.");
                        return;
                    }
                    searchCorpResult = await fetch("./searchFullCorpCik", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            cik: inputValue,
                        }),
                    });
                    break;
                default:
                    break;
            }
            const searchCorpResultParsed = await searchCorpResult.json();

            const resultContainer = document.getElementById(
                "edgarscrapper-searchcorp-result-container"
            );

            tableBody.innerHTML = ""; // 기존 내용 비우기

            searchCorpResultParsed.data.forEach((company, index) => {
                const row = document.createElement("tr");
                row.innerHTML = `
                                        <td>${index + 1}</td>
                                        <td data-cik="${
                                            company.cik
                                        }"><a href="#">${company.title}</a></td>
                                        <td>${company.cik}</td>
                                    `;
                tableBody.appendChild(row);
            });

            resultContainer.style.display = "block"; // 결과 보이기
        } catch (error) {
            console.error(error);
        }
    };
    searchBtn.addEventListener("click", searchCorpName);
    corpNameInput.addEventListener("keydown", async (event) => {
        if (event.key === "Enter") {
            await searchCorpName();
        }
    });
    tableBody.addEventListener("click", (event) => {
        const td = event.target.closest("[data-cik]");
        if (!td) {
            return;
        }
        const value = td.getAttribute("data-cik");
        window.location.href = `./corpDetail?cik=${value}`;
    });
});
