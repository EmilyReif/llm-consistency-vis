#!/bin/sh
set -e

# Clean up stale worktrees if they exist
git worktree prune
rm -rf .gh-pages-tmp

npm run build
cp build/index.html build/404.html

# Create/checkout gh-pages branch in a temp worktree
git worktree add .gh-pages-tmp gh-pages || git worktree add -f .gh-pages-tmp gh-pages

# Copy build output into the gh-pages worktree
rm -rf .gh-pages-tmp/*
cp -r build/* .gh-pages-tmp/

# Commit and push
cd .gh-pages-tmp
git add --all
git commit -m "Deploy $(date)" || echo "No changes to commit"
git push origin gh-pages

# Clean up
cd ..
git worktree remove .gh-pages-tmp
rm -rf build