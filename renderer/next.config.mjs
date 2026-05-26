/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
  trailingSlash: true,
  assetPrefix: '.',
};

export default nextConfig;
