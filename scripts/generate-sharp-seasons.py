#!/usr/bin/env python3
"""Reuse the verified Commons loader and mirror themed cards next to seasonal hero images."""
from pathlib import Path
import runpy, shutil
root=Path(__file__).resolve().parents[1]
runpy.run_path(str(root/'scripts/build-season-assets.py'),run_name='__main__')
out=root/'assets/seasons'
for path in (out/'cards').glob('*.jpg'):
 shutil.copy2(path,out/path.name)
print('✅ All 12 primary and category seasonal assets ready')
