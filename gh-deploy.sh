#!/bin/sh
set -e

npm run build
cp build/index.html build/404.html

# Create/checkout gh-pages branch in a temp worktree
rm -rf .gh-pages-tmp
git worktree add .gh-pages-tmp gh-pages

# Copy build output into the gh-pages worktree
rm -rf .gh-pages-tmp/*
cp -r build/* .gh-pages-tmp/

# Commit and push
cd .gh-pages-tmp
git add --all
git commit -m "Deploy $(date)"
git push origin gh-pages

# Clean up
cd ..
git worktree remove .gh-pages-tmp
rm -rf build