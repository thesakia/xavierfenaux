"""Read-only production gateway regression check; targets a nonexistent episode."""
import http.client
import http.cookiejar
import json
import urllib.parse
import urllib.request

jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
with open('/etc/xavier-master/tool-access.json') as handle:
    credentials = json.load(handle)
client.open('https://xavierfenaux.com/master/', urllib.parse.urlencode(credentials).encode(), timeout=20).close()
cookie = '; '.join(f'{item.name}={item.value}' for item in jar)

def probe(size, authenticated=True):
    connection = http.client.HTTPSConnection('xavierfenaux.com', timeout=20)
    try:
        connection.putrequest('POST', '/clips/api/episodes/gateway-regression-missing/video')
        for key, value in {
            'Content-Length': str(size), 'X-File-Size': str(size),
            'X-File-Name': 'gateway-check.MOV', 'X-Clips-Request': '1',
            'Origin': 'https://xavierfenaux.com', 'Content-Type': 'application/octet-stream',
            'Cookie': cookie if authenticated else '',
        }.items():
            connection.putheader(key, value)
        connection.endheaders(b'0' * 16384)
        response = connection.getresponse()
        expected = 413 if size > 1048576000 else 404 if authenticated else 401
        assert response.status == expected, (size, authenticated, response.status)
        print(f'Upload header {size} bytes, authenticated={authenticated}: HTTP {response.status}')
    finally:
        connection.close()

try:
    probe(2 * 1024 * 1024)
    probe(579252725)
    probe(579252725, False)
    probe(1048576001)
finally:
    client.open('https://xavierfenaux.com/master/?logout=1', timeout=20).close()
print('Large upload authentication, access control and size limit: passed')
