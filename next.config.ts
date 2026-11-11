import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // react-pdf ships its own fonts/yoga wasm; load it from node_modules at runtime instead of bundling.
  serverExternalPackages: ["@react-pdf/renderer"],
  partialPrefetching: true,
  // /docs/api renders docs/openapi.yaml: make sure the file ships with the server bundle.
  outputFileTracingIncludes: { "/docs/api": ["./docs/openapi.yaml"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return [{ source: "/", destination: "/tablero", permanent: false }];
  },
};

export default nextConfig;
