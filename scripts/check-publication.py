#!/usr/bin/env python3
"""Fail closed on private files and common personal-data markers in a publication."""
import argparse
from pathlib import Path
import re
import sys

def check(root, artifact=False):
    findings=[];count=0
    for path in sorted(root.rglob('*')):
        relative=path.relative_to(root)
        if any(part in {'.git','node_modules'} for part in relative.parts):continue
        if path.is_symlink():findings.append((str(relative),'symbolic link'));continue
        if not path.is_file():continue
        count+=1
        if any(part in {'.wrangler','.domolyma-backups','output','transcriptions'} for part in relative.parts) or path.suffix.lower() in {'.sqlite','.db','.docx','.log','.map','.pem','.key'} or path.name.startswith(('.dev.vars','.env')) and not path.name.endswith('.example'):
            findings.append((str(relative),'private file type or directory'))
        data=path.read_bytes()
        for label,pattern in [
            ('personal filesystem path',rb'/(?:Users|Volumes|home)/[A-Za-z0-9_-]+/'),
            ('network share',rb'smb:'+rb'//'),
            ('private key',rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
            ('credential URL',rb'https?://[^\s/@:]+:[^\s/@]+@'),
        ]:
            if re.search(pattern,data):findings.append((str(relative),label))
        # Third-party font/PDF licence credits are public attribution, not imported user data.
        upstream=Path(__file__).resolve().parents[1]/'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'
        upstream_pdf=artifact and path.name.startswith('pdf.worker.min-') and upstream.is_file() and data==upstream.read_bytes()
        if not upstream_pdf and 'LICENSE' not in path.name.upper() and path.suffix.lower() in {'.json','.sql','.ts','.tsx','.md','.html','.txt','.py','.mjs'}:
            for email in re.findall(rb'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}',data):
                domain=email.split(b'@')[-1].decode().lower()
                if domain not in {'example.com','example.org','example.invalid','example.test','users.noreply.github.com'} and not domain.endswith(('.invalid','.example','.test')):
                    findings.append((str(relative),'email requires explicit review'))
    if artifact:
        if not (root/'index.html').is_file() or not (root/'demo/index.html').is_file() or not (root/'demo/demo-worker.js').is_file():findings.append(('.', 'missing presentation/demo entry point'))
    return count,sorted(set(findings))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('directory',type=Path);parser.add_argument('--artifact',action='store_true');args=parser.parse_args()
    count,findings=check(args.directory,args.artifact)
    for path,reason in findings:print(f'{path}: {reason}')
    print(f'Publication boundary: {count} files, {len(findings)} findings.')
    sys.exit(bool(findings))
