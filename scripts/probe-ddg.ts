import { politeGet } from "../lib/research/crawler/fetcher";

async function main() {
  const url = "https://html.duckduckgo.com/html/?q=Berufsschule+Elektronik+K%C3%B6ln&kl=de-de";
  const r = await politeGet(url, { skipRobots: true });
  if (!r.ok) {
    console.log("FAIL:", r.reason, r.status);
    return;
  }
  console.log("OK status:", r.status, "bytes:", r.html.length);
  console.log("hasResultA:", r.html.includes("result__a"));
}
main();
