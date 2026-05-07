import { parseGoogleSheet } from "../lib/import/parser";

async function main() {
  const url =
    process.argv[2] ??
    "https://docs.google.com/spreadsheets/d/1aQpvGOwn7IZQ8B_yJgBRtRYjaG1cE9LHDhKYr-kQg2A/edit?gid=0";
  console.log("Testing:", url);
  try {
    const r = await parseGoogleSheet(url);
    console.log("OK rows:", r.rows.length);
    console.log("Headers:", r.headers.slice(0, 6));
    console.log("First row:", r.rows[0]);
  } catch (err) {
    console.error("ERR:", err instanceof Error ? err.message : err);
  }
}

main();
