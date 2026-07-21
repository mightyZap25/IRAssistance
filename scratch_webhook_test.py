import requests
import json

WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbwEqEIkheWEg3SoFq9A7hyA92dvWH4tuxIYDXHYGRSOE4BcfTg1yLvAyhuIumkhSda0gg/exec"

payload = {
    "app_name": "TestApp",
    "record_name": "TestRecord001",
    "csv_data": "col1,col2\nval1,val2\n"
}
headers = {'Content-Type': 'application/json'}

try:
    print("Sending POST request to Webhook...")
    response = requests.post(WEBHOOK_URL, data=json.dumps(payload), headers=headers, timeout=15)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
