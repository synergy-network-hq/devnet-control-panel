#!/usr/bin/env bash
# verify-signing-key.sh
# Run this BEFORE pushing a release tag to confirm the signing key is valid.
# It reads TAURI_SIGNING_PRIVATE_KEY exactly as GitHub Actions would, and
# validates it against the pubkey in tauri.conf.json.
#
# Usage:
#   export TAURI_SIGNING_PRIVATE_KEY="<value from GitHub secret>"
#   ./scripts/verify-signing-key.sh
#
# Or pass inline:
#   TAURI_SIGNING_PRIVATE_KEY="..." ./scripts/verify-signing-key.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }
info() { echo -e "${YELLOW}→${NC} $1"; }

echo ""
echo "=== Tauri Signing Key Verifier ==="
echo ""

# 1. Check the env var is set
if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  fail "TAURI_SIGNING_PRIVATE_KEY is not set. Export it first:
  export TAURI_SIGNING_PRIVATE_KEY=\"<value from GitHub secret>\""
fi

info "Checking TAURI_SIGNING_PRIVATE_KEY..."

# 2. Verify it base64-decodes cleanly
DECODED=$(echo "$TAURI_SIGNING_PRIVATE_KEY" | base64 -d 2>/dev/null) || \
  fail "Secret value is not valid base64. Check that it was copied correctly with no extra whitespace."

pass "Secret base64-decodes successfully"

# 3. Check it decodes to two lines (minisign format)
LINE_COUNT=$(echo "$DECODED" | wc -l | tr -d ' ')
if [[ "$LINE_COUNT" -lt 2 ]]; then
  fail "Decoded value only has ${LINE_COUNT} line(s). Expected 2 lines (untrusted comment + base64 key)."
fi
pass "Decoded value has correct two-line minisign format"

# 4. Check the first line is "untrusted comment: minisign secret key ..."
FIRST_LINE=$(echo "$DECODED" | head -1)
if [[ "$FIRST_LINE" != "untrusted comment: minisign secret key"* ]]; then
  fail "First line is not a valid minisign header. Got: '$FIRST_LINE'"
fi
pass "First line is valid minisign header: $FIRST_LINE"

# 5. Extract and decode the raw key bytes
KEY_B64=$(echo "$DECODED" | sed -n '2p')
RAW_KEY=$(echo "$KEY_B64" | base64 -d 2>/dev/null) || \
  fail "Key line is not valid base64."

pass "Raw key bytes decode successfully"

# 6. Check KDF algorithm bytes (bytes 2-3)
KDF_BYTES=$(echo "$RAW_KEY" | xxd -l 6 -p 2>/dev/null || \
            printf "%s" "$RAW_KEY" | od -A n -t x1 -N 6 | tr -d ' \n')

SIG_ALG="${KDF_BYTES:0:4}"   # bytes 0-1
KDF_ALG="${KDF_BYTES:4:4}"   # bytes 2-3

info "Signature algorithm: ${KDF_BYTES:0:4} (expect: 4564 = 'Ed')"
info "KDF algorithm:       ${KDF_BYTES:4:4} (expect: 0000 = no scrypt, or 5363 = scrypt with password)"

if [[ "$SIG_ALG" != "4564" ]]; then
  fail "Not an Ed25519 key (sig_alg bytes: $SIG_ALG, expected 4564)"
fi
pass "Ed25519 signature algorithm confirmed"

if [[ "$KDF_ALG" == "0000" ]]; then
  pass "KDF = none (passwordless key, no TAURI_SIGNING_PRIVATE_KEY_PASSWORD needed)"
elif [[ "$KDF_ALG" == "5363" ]]; then
  echo -e "${YELLOW}⚠${NC}  KDF = scrypt (key requires a password)"
  echo "   Set TAURI_SIGNING_PRIVATE_KEY_PASSWORD in your workflow/secrets."
  echo "   If this key was created with -W (no password), it still requires empty string ''"
else
  fail "Unknown KDF algorithm: $KDF_ALG"
fi

# 7. Extract pubkey from tauri.conf.json
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF="$SCRIPT_DIR/../src-tauri/tauri.conf.json"
if [[ ! -f "$CONF" ]]; then
  fail "tauri.conf.json not found at $CONF"
fi

CONF_PUBKEY=$(python3 -c "
import json, sys
with open('$CONF') as f:
  c = json.load(f)
print(c['plugins']['updater']['pubkey'])
" 2>/dev/null) || fail "Could not read pubkey from tauri.conf.json"

pass "Found pubkey in tauri.conf.json: $CONF_PUBKEY"

# 8. Verify key_id matches between privkey and pubkey
KEY_ID_FROM_HEADER=$(echo "$FIRST_LINE" | awk '{print $NF}')
KEY_ID_FROM_PUBKEY=$(python3 -c "
import base64, binascii
b = base64.b64decode('$CONF_PUBKEY')
print(binascii.hexlify(b[2:10]).decode().upper())
" 2>/dev/null) || fail "Could not decode pubkey from tauri.conf.json"

if [[ "${KEY_ID_FROM_HEADER,,}" == "${KEY_ID_FROM_PUBKEY,,}" ]]; then
  pass "Key IDs match: $KEY_ID_FROM_HEADER"
else
  fail "KEY ID MISMATCH!
  Private key ID: $KEY_ID_FROM_HEADER
  Public key ID:  $KEY_ID_FROM_PUBKEY
  The pubkey in tauri.conf.json does not match this private key."
fi

echo ""
echo -e "${GREEN}All checks passed. This key is ready for CI.${NC}"
echo ""
