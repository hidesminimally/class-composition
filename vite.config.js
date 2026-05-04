import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

// Capture build-time version metadata so the running app can announce which
// commit it was built from. Falls back to "dev" if git isn't available
// (e.g., when the source tarball is built outside a git checkout).
function getGitInfo() {
  // Netlify exposes COMMIT_REF and BRANCH on every build (shallow clones break
  // `git status --porcelain`-based dirty detection, so prefer the env vars).
  if (process.env.COMMIT_REF) {
    return {
      sha: process.env.COMMIT_REF.slice(0, 7),
      branch: process.env.BRANCH || process.env.HEAD || 'unknown',
    };
  }
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().length > 0;
    return { sha: sha + (dirty ? '-dirty' : ''), branch };
  } catch {
    return { sha: 'dev', branch: 'unknown' };
  }
}

const { sha, branch } = getGitInfo();
const buildTime = new Date().toISOString();

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify({ sha, branch, buildTime }),
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
