#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/MacRemoteMCP"
TEST_DIR="$SCRIPT_DIR/Tests"
BUILD_DIR="$SCRIPT_DIR/build-tests"

echo "▶ Compiling Swift tests..."

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Compile Logic.swift (shared testable code) + TestRunner.swift
swiftc \
  -o "$BUILD_DIR/run-tests" \
  -target arm64-apple-macos13 \
  "$APP_DIR/Logic.swift" \
  "$TEST_DIR/TestRunner.swift" \
  2>&1

echo "▶ Running tests..."
echo ""
"$BUILD_DIR/run-tests"
EXIT_CODE=$?

rm -rf "$BUILD_DIR"
exit $EXIT_CODE
