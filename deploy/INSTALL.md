# Install

1. Log the server in to the GitHub container registry with a token that can read packages.
2. Put `compose.yaml` and `.env` (from `.env.example`) into one folder and fill in `.env`.
3. Start the stack. The app listens on `127.0.0.1:8470`; put a reverse proxy with HTTPS in front of it.
4. Open the address in a browser and create the first account.

Updates: pull the `stable` image and restart the stack. The database schema updates itself on start.
