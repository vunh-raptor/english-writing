/** @type {import('next').NextConfig} */
const nextConfig = {
  // We run our own TypeScript checks; lint config is added in a later phase.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
