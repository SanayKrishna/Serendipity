import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError

BASE='http://127.0.0.1:8000'

def req(method, path, data=None, headers=None):
    url = BASE+path
    body = None
    hdrs = {'Content-Type':'application/json'}
    if headers:
        hdrs.update(headers)
    if data is not None:
        body = json.dumps(data).encode('utf-8')
    req = Request(url, data=body, headers=hdrs, method=method)
    try:
        with urlopen(req, timeout=10) as r:
            return r.getcode(), r.read().decode('utf-8')
    except HTTPError as e:
        return e.code, e.read().decode('utf-8')
    except Exception as e:
        return None, str(e)

print('GET /pins/all (before)')
code, body = req('GET', '/pins/all')
print(code, body[:1000])

print('\nPOST /pin (create new test pin)')
payload = {'content':'Test pin from script','lat':35.0,'lon':139.0}
code, body = req('POST', '/pin', data=payload)
print('status', code)
print(body)

print('\nGET /pins/all (after create)')
code, body = req('GET', '/pins/all')
print(code, body[:1000])

# try to extract newest pin id from JSON
try:
    pins = json.loads(body)
    if pins:
        newest = pins[0]
        pid = newest.get('id')
    else:
        pid = None
except Exception:
    pid = None

print('\nNew pin id:', pid)
if not pid:
    print('No pin id found; aborting')
    raise SystemExit(1)

print('\nPOST /pin/{id}/report (1)')
code, body = req('POST', f'/pin/{pid}/report')
print(code, body)

print('\nPOST /pin/{id}/report (2)')
code, body = req('POST', f'/pin/{pid}/report')
print(code, body)

print('\nGET /pins/all (final)')
code, body = req('GET', '/pins/all')
print(code, body[:1000])
