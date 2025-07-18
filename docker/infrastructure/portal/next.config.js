/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    outputFileTracingRoot: undefined,
  },
  env: {
    DOCKER_HOST: process.env.DOCKER_HOST || 'unix:///var/run/docker.sock',
    HOST_PROC_PATH: process.env.HOST_PROC_PATH || '/host/proc',
    HOST_SYS_PATH: process.env.HOST_SYS_PATH || '/host/sys',
    HOST_DATA_PATH: process.env.HOST_DATA_PATH || '/host/data',
  },
}

module.exports = nextConfig
