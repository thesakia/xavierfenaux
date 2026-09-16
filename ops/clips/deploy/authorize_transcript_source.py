"""Install only the dedicated export key; preserve all existing SSH access."""
import argparse
import base64
import ipaddress
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('public_key', type=Path)
    parser.add_argument('--source-ip', required=True)
    args = parser.parse_args()
    source = str(ipaddress.ip_address(args.source_ip))
    parts = args.public_key.read_text().split()
    if len(parts) < 2 or parts[0] != 'ssh-ed25519' or len(base64.b64decode(parts[1], validate=True)) != 51:
        raise ValueError('Expected an Ed25519 public key.')
    path = Path('/root/.ssh/authorized_keys')
    original = path.read_text() if path.exists() else ''
    matching = [line for line in original.splitlines() if parts[1] in line.split()]
    line = f'restrict,from="{source}",command="/usr/bin/python3 /usr/local/libexec/ft-clips-export-transcripts.py --stdout" {parts[0]} {parts[1]} ft-clips-transcript-readonly'
    if matching:
        if matching != [line]:
            raise RuntimeError('Key already exists with different permissions; no change made.')
        print('Restricted transcript key already installed.')
        return
    temporary = path.with_name('authorized_keys.clips-tmp')
    temporary.write_text(original.rstrip('\n') + '\n' + line + '\n')
    temporary.chmod(0o600)
    temporary.replace(path)
    print('Restricted transcript key installed; existing access preserved.')


if __name__ == '__main__':
    main()
