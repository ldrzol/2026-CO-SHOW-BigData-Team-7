from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root/'HANDOFF_MANIFEST.json').read_text(encoding='utf-8'))
for item in manifest['files']:
    path = root/item['path']
    assert path.is_file(), 'Missing: '+item['path']
    content = path.read_bytes()
    assert len(content)==item['bytes'], 'Size mismatch: '+item['path']
    assert hashlib.sha256(content).hexdigest()==item['sha256'], 'Hash mismatch: '+item['path']
print('Handoff integrity passed:', len(manifest['files']), 'manifested files')
