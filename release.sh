#!/bin/bash
set -e

MANIFEST="manifest.json"
CURRENT=$(grep '"version"' "$MANIFEST" | sed 's/.*"\([0-9.]*\)".*/\1/')
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

NEXT_PATCH=$((PATCH + 1))
NEXT="$MAJOR.$MINOR.$NEXT_PATCH"

MSG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --minor) NEXT_TYPE="minor"; shift ;;
    --major) NEXT_TYPE="major"; shift ;;
    -m) MSG="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [ "$NEXT_TYPE" = "minor" ]; then
  NEXT="$MAJOR.$((MINOR + 1)).0"
elif [ "$NEXT_TYPE" = "major" ]; then
  NEXT="$((MAJOR + 1)).0.0"
fi

COMMIT_MSG="release v$NEXT"
[ -n "$MSG" ] && COMMIT_MSG="$COMMIT_MSG: $MSG"
echo "Version: $CURRENT -> $NEXT"
echo "Commit: $COMMIT_MSG"
read -p "Confirm release? [y/N] " CONFIRM
[[ "$CONFIRM" =~ ^[yY]$ ]] || { echo "Aborted."; exit 1; }

sed -i '' "s/\"version\": \"$CURRENT\"/\"version\": \"$NEXT\"/" "$MANIFEST"

mkdir -p dist
ZIP="dist/proxied-v${NEXT}.zip"
rm -f "$ZIP"
zip -r "$ZIP" . -x "*.git*" "release.sh" "README.txt" "dist/*" "*.DS_Store"

git add -A
git commit -m "$COMMIT_MSG"
git tag "v$NEXT"

echo "Done: tag v$NEXT, archive $ZIP"
