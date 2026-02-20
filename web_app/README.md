# PN532 User ID – Web App

Web app that talks to the Arduino User ID interface over **serial** (no changes to the Arduino sketch). Uses the [Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API) to connect to the board.

## Protocol (from Arduino)

- **Baud:** 115200  
- **Commands (one line, newline-terminated):**
  - `READ` → Arduino replies `WAITING`, then after a card is presented: `OK|READ|userid` or `ERROR|message`
  - `WRITE|userid` → Arduino replies `WAITING`, then after a card: `OK|WRITE` or `ERROR|message`
- User ID: max **15 characters**.

## How to run

1. **Serve the app over HTTP** (required for Web Serial – it needs a secure context, e.g. `https://` or `http://localhost`).  
   From the `web_app` folder:
   - **Python 3:** `python -m http.server 8080`
   - **Node:** `npx serve -p 8080`
2. Open **Chrome** or **Edge** and go to `http://localhost:8080`.
3. Connect the Arduino (with the User ID sketch and PN532) via USB.
4. Click **Connect to Arduino**, choose the correct COM port, then use **Read from card** and **Write to card** as needed.

## Browser support

Web Serial is supported in **Chrome** and **Edge**. It is not supported in Firefox or Safari.
