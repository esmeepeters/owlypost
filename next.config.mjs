/** @type {import('next').NextConfig} */
const nextConfig = {
  // nodemailer is server-only and uses conditional requires; keep it out of
  // the bundle and load it from node_modules at runtime.
  serverExternalPackages: ["nodemailer"],
};

export default nextConfig;
