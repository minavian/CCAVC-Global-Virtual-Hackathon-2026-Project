# CCAVC-Global-Virtual-Hackathon-2026-Project

The RFID demo is a static site. The 3D code, fonts, models and images ship with the site, so it can run offline once you have the files.

## Run it on your computer

Get the `feat/16-hand-scan` branch or extract the site ZIP. Open a terminal in the folder that contains `index.html` and run one of these commands.

**Windows**

```powershell
py -3 -m http.server 8000 --bind 127.0.0.1
```

**macOS or Linux**

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Keep the terminal open and visit [http://127.0.0.1:8000/](http://127.0.0.1:8000/). If port 8000 is in use, change it in both the command and address. Opening `index.html` directly from disk prevents the browser from loading the JavaScript modules and models.

## Share it with someone else

- **Same Wi-Fi.** Run the server from the extracted ZIP and use `--bind 0.0.0.0` in the command above. Share `http://YOUR-LOCAL-IP:8000/` using your computer’s local network address. Allow Python through the firewall on the private network if prompted. `127.0.0.1` always points to the computer that opens the link.
- **Different networks.** Send the ZIP so they can run it locally, or upload the extracted site files to a static host. Keep `index.html`, `styles.css`, `js/`, `models/`, `vendor/` and `bit-river/` together. Give them the host’s URL.

The full 3D demo needs a browser with WebGL 2. If the scan view cannot start 3D, the static preview and **Scan card** button let visitors continue to the explanation and Bit River.
