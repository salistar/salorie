/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // firebase-admin is server-only; keep it out of the client bundle (Next 14 key).
  experimental: { serverComponentsExternalPackages: ['firebase-admin'] },
  // En-têtes de sécurité (anti-clickjacking, anti-sniff, fuite de referrer).
  // CSP stricte volontairement omise (Next + styles/scripts inline) pour ne rien casser.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};
export default nextConfig;
