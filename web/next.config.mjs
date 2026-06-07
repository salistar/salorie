/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // firebase-admin is server-only; keep it out of the client bundle (Next 14 key).
  experimental: { serverComponentsExternalPackages: ['firebase-admin'] },
};
export default nextConfig;
