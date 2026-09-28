"""Copy the knowledge base into web/index.html.

The page loads kb/*.pl directly when it is served over http. When
web/index.html is opened straight from the disk the browser refuses that, so
index.html carries a mirror of the knowledge base inside a
<script type="text/prolog"> block.

Run this after editing anything in kb/:    python build.py
or just double-click                       build.bat
"""

import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

# The knowledge base, in the order it must be consulted. Nothing in an earlier
# file depends on a later one. app.js and test/cases.js load the same three
# files in the same order, and a test checks that the three lists agree.
KB_FILES = ["facts.pl", "rules.pl", "decisions.pl"]

TEMPLATE = os.path.join(HERE, "web", "index.template.html")
OUT = os.path.join(HERE, "web", "index.html")

parts = []
for name in KB_FILES:
    path = os.path.join(HERE, "kb", name)
    with io.open(path, encoding="utf-8") as f:
        parts.append(f.read())
kb = "\n".join(parts)

if "</script" in kb.lower():
    sys.exit("the knowledge base contains </script, which would break the embedded block.")

with io.open(TEMPLATE, encoding="utf-8") as f:
    html = f.read()

html = html.replace("__KB__", kb.rstrip())

# newline="\n" keeps the output identical on every platform. Without it
# Python rewrites every line ending on Windows, so a rebuild that changed
# nothing would still show up as a change to the whole file.
with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(html)

print("web/index.html rebuilt from %s (%d lines)"
      % (", ".join("kb/" + n for n in KB_FILES), len(kb.splitlines())))
