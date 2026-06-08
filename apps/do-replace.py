import base64,sys
TARGET='apps/CognitiveNetworkApp.tsx'
PATCH='apps/workshop-new.txt'
S=967
E=1125
with open(TARGET,'r',encoding='utf-8') as f:
    lines=f.readlines()
with open(PATCH,'r',encoding='utf-8') as f:
    new=f.read()
if not new.endswith(chr(10)):
    new+=chr(10)
nl=new.splitlines(True)
r=lines[:S]+nl+lines[E:]
with open(TARGET,'w',encoding='utf-8') as f:
    f.writelines(r)
print('Done',len(lines),'->',len(r))
