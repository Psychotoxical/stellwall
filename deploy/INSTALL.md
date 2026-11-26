# Install

1. Log the server in to the GitHub container registry with a token that can read packages.
2. Put `compose.yaml` and `.env` (from `.env.example`) into one folder and fill in `.env`.
3. Start the stack. The app listens on `127.0.0.1:8470`; put a reverse proxy with HTTPS in front of it.
   The proxy must pass websockets (live updates on `/api/live`) and the client address:

   ```nginx
   proxy_http_version 1.1;
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection $connection_upgrade;
   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   proxy_read_timeout 3600s;
   ```
4. Open the address in a browser and create the first account.

Updates: pull the `stable` image and restart the stack. The database schema updates itself on start.
