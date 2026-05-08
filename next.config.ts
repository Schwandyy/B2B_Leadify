import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone-Build kopiert nur die nötigen node_modules in den Output —
  // das Docker-Image bleibt klein (~200 MB statt ~1,5 GB).
  output: "standalone",
};

export default nextConfig;
