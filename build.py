"""Copy kb.pl into index.html.

The page loads kb.pl directly when it is served over http. When index.html is
opened straight from the disk the browser refuses that, so index.html carries a
mirror of kb.pl inside a <script type="text/prolog"> block.

Run this after editing kb.pl:      python build.py
or just double-click             build.bat
"""

import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
KB = os.path.join(HERE, "kb.pl")
TEMPLATE = os.path.join(HERE, "index.template.html")
OUT = os.path.join(HERE, "index.html")

with io.open(KB, encoding="utf-8") as f:
    kb = f.read()

if "</script" in kb.lower():
    sys.exit("kb.pl contains </script, which would break the embedded block.")

with io.open(TEMPLATE, encoding="utf-8") as f:
    html = f.read()

html = html.replace("__KB__", kb.rstrip())

with io.open(OUT, "w", encoding="utf-8") as f:
    f.write(html)

print("index.html rebuilt from kb.pl (%d lines)" % len(kb.splitlines()))
