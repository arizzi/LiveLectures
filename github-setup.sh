#!/bin/bash

# GitHub Repository Setup Instructions
# Run these commands in order to set up your GitHub repository

echo "=== GitHub Repository Setup ==="
echo ""
echo "1. First, create a new repository on GitHub:"
echo "   - Go to https://github.com/new"
echo "   - Repository name: LiveLecturesSingle"
echo "   - Description: Advanced Notes App with AI LaTeX conversion and audio transcription"
echo "   - Make it Public (required for GitHub Pages)"
echo "   - Do NOT initialize with README (we already have one)"
echo "   - Click 'Create repository'"
echo ""
echo "2. Then run these commands in your terminal:"
echo ""

# The actual commands to run
cat << 'EOF'
# Add the GitHub remote (replace 'arizzi' with your username if different)
git remote add origin https://github.com/arizzi/LiveLecturesSingle.git

# Push the code to GitHub
git push -u origin main

# The repository should now be available at:
# https://github.com/arizzi/LiveLecturesSingle
EOF

echo ""
echo "3. Enable GitHub Pages:"
echo "   - Go to your repository on GitHub"
echo "   - Click 'Settings' tab"
echo "   - Scroll down to 'Pages' section in the left sidebar"
echo "   - Under 'Source', select 'Deploy from a branch'"
echo "   - Select 'main' branch and '/ (root)' folder"
echo "   - Click 'Save'"
echo ""
echo "4. Your app will be live at:"
echo "   https://arizzi.github.io/LiveLecturesSingle"
echo "   (May take a few minutes to deploy)"
echo ""
echo "=== Additional Notes ==="
echo ""
echo "- The app is completely client-side, perfect for GitHub Pages"
echo "- Users will need to set their own Gemini API key for LaTeX conversion"
echo "- All other features work without any API keys"
echo "- The app works offline once loaded (except for AI features)"
echo ""
echo "To update the live site in the future:"
echo "1. Make your changes"
echo "2. git add ."
echo "3. git commit -m 'Your commit message'"
echo "4. git push"
echo "GitHub Pages will automatically update!"