import sys

path = r'c:\Users\yasha_ambulkar\OneDrive\Documents\26-03-26\MAIN\client\src\pages\EvaraFlowAnalytics.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

level = 0
for i, char in enumerate(content):
    if char == '{':
        level += 1
    elif char == '}':
        level -= 1
    if level < 0:
        print(f"Negative level at char {i}")
        break

print(f"Final level: {level}")
