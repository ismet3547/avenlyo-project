import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["better-sqlite3", "@napi-rs/canvas", "tesseract.js"],
};

export default nextConfig;
