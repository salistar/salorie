# -*- coding: utf-8 -*-
"""
Ajoute des couleurs ANSI aux logs API :
- vert  (\x1b[32m) pour les REQUEST / inputs  ([API->X])
- rouge (\x1b[31m) pour les RESPONSE / outputs ([API<-X])
- reset (\x1b[0m) a la fin de la chaine principale
Les logs qui n'appartiennent pas au protocole [API...] restent blancs.
"""
import re, pathlib

ROOT = pathlib.Path(r"C:\Users\21266\Desktop\sdk52\salorie\salorie")

TARGETS = [
    "lib/NotificationService.ts",
    "lib/PurchasesService.ts",
    "lib/firebase.ts",
    "lib/InsightsService.ts",
    "lib/translator.ts",
    "lib/fatsecret.ts",
    "lib/AiModel.ts",
    "app/scan-analysis.tsx",
    "app/(auth)/sign-in.tsx",
    "app/(auth)/sign-up.tsx",
    "app/(tabs)/profile.tsx",
]

GREEN = r"\x1b[32m"
RED   = r"\x1b[31m"
RESET = r"\x1b[0m"

# patterns : le premier argument de console.log/error est une string
# littérale '...[API→...' ou "...[API←..."
# Inputs : [API→ OR [API->
# Outputs: [API← OR [API<-

INPUT_MARK  = "[API\u2192"   # →
OUTPUT_MARK = "[API\u2190"   # ←

def colorize_line(line: str) -> str:
    # detecter le type
    if INPUT_MARK in line:
        color = GREEN
        mark = INPUT_MARK
    elif OUTPUT_MARK in line:
        color = RED
        mark = OUTPUT_MARK
    else:
        return line

    # eviter de re-patcher
    if "\\x1b[" in line:
        return line

    # cibler uniquement la premiere string literal apres console.log/error(
    # pattern: console.(log|error|warn)\s*\(\s*(['"`])(...)\2
    m = re.match(
        r"^(\s*console\.(?:log|error|warn)\s*\(\s*)(['\"`])([^'\"`]*?\[API[\u2192\u2190][^'\"`]*?)\2",
        line,
    )
    if not m:
        return line
    prefix, quote, content = m.group(1), m.group(2), m.group(3)
    new_first = f"{prefix}{quote}{color}{content}{RESET}{quote}"
    return new_first + line[m.end():]

total = 0
for rel in TARGETS:
    path = ROOT / rel
    if not path.exists():
        print(f"!! absent: {rel}")
        continue
    text = path.read_text(encoding="utf-8")
    out_lines = []
    changed = 0
    for line in text.splitlines(keepends=True):
        new = colorize_line(line)
        if new != line:
            changed += 1
        out_lines.append(new)
    if changed:
        path.write_text("".join(out_lines), encoding="utf-8")
        print(f"ok  {rel}  ({changed} logs colorises)")
        total += changed
    else:
        print(f"--  {rel}  (rien a changer)")

print(f"\nTotal: {total} logs colorises")
