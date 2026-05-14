# -*- coding: utf-8 -*-
"""Remplace tous les codes ANSI rouges (\x1b[31m) par bleus (\x1b[34m)
dans les fichiers de logs API."""
import pathlib

ROOT = pathlib.Path(r"C:\Users\21266\Desktop\sdk52\salorie\salorie")
TARGETS = [
    "lib/NotificationService.ts","lib/PurchasesService.ts","lib/firebase.ts",
    "lib/InsightsService.ts","lib/translator.ts","lib/fatsecret.ts","lib/AiModel.ts",
    "lib/LocalDataStore.ts","app/scan-analysis.tsx","app/(auth)/sign-in.tsx",
    "app/(auth)/sign-up.tsx","app/(tabs)/profile.tsx","app/_layout.tsx",
]

RED = "\\x1b[31m"
BLUE = "\\x1b[34m"

total = 0
for rel in TARGETS:
    p = ROOT / rel
    if not p.exists():
        print("!!", rel); continue
    t = p.read_text(encoding="utf-8")
    n = t.count(RED)
    if n:
        t = t.replace(RED, BLUE)
        p.write_text(t, encoding="utf-8")
        print(f"ok  {rel}  ({n} logs rouge -> bleu)")
        total += n
    else:
        print(f"--  {rel}")
print(f"\nTotal: {total} logs passes en bleu")
