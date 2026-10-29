// Runtime configuration, kept out of the bundle so it can be changed without a
// rebuild. The Docker image rewrites this file on container start, any other
// deployment leaves it empty and the build-time VITE_* variables apply.
window.__IMMICH_BOOK_CONFIG__ = {};
