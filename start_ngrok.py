import time
from pyngrok import ngrok
ngrok.set_auth_token('3Eltk9074vZ0hfVFMGDRIIsONt1_5QQXnHFkUDvM6WzvCi6dd')
url = ngrok.connect(8001)
print('NGROK_URL=' + url.public_url, flush=True)

try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    pass
