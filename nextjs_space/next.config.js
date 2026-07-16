/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Szkielet: nie blokuj builda lintem na tym etapie.
    ignoreDuringBuilds: false,
  },
};

module.exports = nextConfig;
