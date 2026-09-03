#!/usr/bin/env python3
"""Validate HA-MyFitnessPal release/version wiring before tagging."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "custom_components" / "myfitnesspal" / "manifest.json"
INIT = ROOT / "custom_components" / "myfitnesspal" / "__init__.py"
LOADER = ROOT / "custom_components" / "myfitnesspal" / "frontend" / "ha-myfitnesspal-loader.js"
CARD = ROOT / "custom_components" / "myfitnesspal" / "frontend" / "ha-myfitnesspal-card.js"


def fail(message: str) -> None:
    raise SystemExit(f"ERROR: {message}")


manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
version = manifest.get("version")
if not isinstance(version, str) or not version:
    fail("manifest.json has no valid version")

init_text = INIT.read_text(encoding="utf-8")
loader_text = LOADER.read_text(encoding="utf-8")
card_text = CARD.read_text(encoding="utf-8")

init_match = re.search(r"ha-myfitnesspal-loader\.js\?v=([^\"']+)", init_text)
if not init_match:
    fail("__init__.py does not contain a versioned loader URL")
if init_match.group(1) != version:
    fail(
        f"loader cache version {init_match.group(1)!r} does not match manifest {version!r}"
    )

loader_match = re.search(
    r'HA_MFP_LOADER_VERSION\s*=\s*"([^"]+)"',
    loader_text,
)
if not loader_match:
    fail("frontend loader has no HA_MFP_LOADER_VERSION")
if loader_match.group(1) != version:
    fail(
        f"frontend loader version {loader_match.group(1)!r} does not match manifest {version!r}"
    )

if 'customElements.define("ha-myfitnesspal-card"' not in card_text:
    fail("card module does not register ha-myfitnesspal-card")

print(f"Release wiring OK: {version}")
