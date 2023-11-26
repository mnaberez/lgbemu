# Commodore LCD Emulator in JavaScript

This is [Gábor Lénárt](https://github.com/lgblgblgb)'s emulator published at:
[http://commodore-lcd.lgb.hu/emulator.html](https://web.archive.org/web/20220928084912if_/http://commodore-lcd.lgb.hu/emulator.html)

It has the following minor changes:

 - Fixed a crash when the `W` command is run in the `MONITOR` ([`bde89e9`](https://github.com/mnaberez/lgbemu/commit/bde89e92851fdc967995ec762e988ba2c0f73c8b)).
 - The emulator can now be run with Python's built-in webserver, which is useful for playing with the ROM code.

Run this command from the root of the git clone:

    python3 -m http.server --bind 127.0.0.1 8000

Open a browser to http://127.0.0.1:8000.
