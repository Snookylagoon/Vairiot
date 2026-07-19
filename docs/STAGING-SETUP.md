# Staging server setup — step by step (for a complete beginner)

This guide walks you through building a **test copy of Vairiot** on its own small
cloud server, reachable at `test.vairiot.com`. You will use it to safely try every
change before it goes anywhere near the live site.

Read it top to bottom the first time. Every command is written out in full — you
copy it, paste it, press Enter. After most steps there's a **"You should see"**
note so you know it worked. If something doesn't match, jump to
[Troubleshooting](#13-troubleshooting) at the bottom.

**Words you'll see:**
- **Terminal** — the black text app on your Mac. Open it: press `Cmd+Space`, type
  `Terminal`, press Enter.
- **SSH** — a way to type commands on the remote server from your Mac's Terminal.
- **`$`** — at the start of a command line it just means "this is a command";
  don't type the `$` itself.
- **The server / the VPS** — your new test cloud computer.

> ⏱ Total time: about 60–90 minutes the first time. You only do steps 1–8 once.

---

## What you're building

```
Your Mac  ──SSH──►  Staging server (Hetzner, in Europe)
                     └── Docker runs: nginx, web, admin, api, worker,
                         postgres, redis, minio, reports
Browser   ──HTTPS─►  https://test.vairiot.com      (the app)
                     https://testadmin.vairiot.com  (the admin panel)
```

It is the *same software as production*, on a *separate machine*, with a
*separate database*. Nothing you do here can affect the live site.

---

## 1. Create the server (Hetzner Cloud)

We'll use **Hetzner** — cheap, reliable, and has data centres in Europe (good for
your Europe/UAE users and for GDPR).

1. Go to **https://console.hetzner.cloud** and create an account. You'll need an
   email and a payment card. (Billing is by the hour; a stopped/deleted server
   stops charging.)
2. Verify your email and add a payment method when asked.
3. Click **+ New Project**, name it `vairiot-staging`, click it to open it.
4. Click **+ Create Server** (or **Add Server**). Set:
   - **Location:** `Falkenstein` or `Nuremberg` (Germany) — an EU region.
   - **Image:** `Ubuntu 24.04`.
   - **Type:** click the **Shared vCPU** tab, choose **CPX31** (4 vCPU, 8 GB RAM,
     ~€8/month). *This has enough memory to build and run the whole stack.* (The
     smaller CX22/4 GB works but is tight when building — 8 GB avoids headaches.)
   - **Networking:** leave IPv4 + IPv6 ticked.
   - **SSH keys:** we'll add one in Step 2 — for now skip; you can also come back.
     (If you'd rather, do Step 2 first, then this.)
   - **Name:** `vairiot-staging`.
5. Click **Create & Buy Now**.
6. After ~30 seconds the server appears with a **public IP address** like
   `5.75.xxx.xxx`. **Copy that number and paste it somewhere safe** — you'll use
   it a lot. In this guide we'll call it `SERVER_IP`.

> ✅ **Checkpoint:** you have a server and its IP address.

---

## 2. Make an SSH key and log in

An SSH key is a pair of files: a **public** one you give the server, and a
**private** one that stays secret on your Mac. It's safer than a password.

1. Open **Terminal** on your Mac.
2. Check if you already have a key:
   ```
   ls ~/.ssh/id_ed25519.pub
   ```
   - If it prints a path (no "No such file"), you already have one — **skip to
     step 4**.
   - If it says *No such file or directory*, make one in step 3.
3. Create the key (press Enter at every prompt to accept defaults — you can leave
   the passphrase empty):
   ```
   ssh-keygen -t ed25519 -C "vairiot-staging"
   ```
   **You should see** a little ASCII-art box and "Your public key has been saved".
4. Show your public key so you can copy it:
   ```
   cat ~/.ssh/id_ed25519.pub
   ```
   It prints one line starting with `ssh-ed25519 AAAA...`. **Select the whole
   line and copy it** (Cmd+C).
5. Give it to the server:
   - **If you skipped SSH keys when creating the server:** in the Hetzner console,
     open your server → **Rescue**/**...** menu isn't it — instead the easy path
     is: left menu **Security → SSH Keys → Add SSH Key**, paste the line, name it
     `my-mac`, save. Then rebuild isn't needed if you use the password Hetzner
     emailed you for the first login (see below) and add the key later. **Simplest
     for a beginner:** delete this server and re-create it (Step 1), and this time
     at the **SSH keys** section pick the key you just added. A fresh server takes
     30 seconds.
6. Log in for the first time (replace `SERVER_IP` with your number):
   ```
   ssh root@SERVER_IP
   ```
   - The first time it asks *"Are you sure you want to continue connecting?"* —
     type `yes` and Enter.
   - **You should see** a prompt change to something like `root@vairiot-staging:~#`.
     You are now typing commands **on the server**.

> ✅ **Checkpoint:** your Terminal prompt shows `root@vairiot-staging`. To leave the
> server later, type `exit`. To come back, `ssh root@SERVER_IP` again.

---

## 3. Point the test web addresses at your server (DNS)

You need `test.vairiot.com` and `testadmin.vairiot.com` to point at `SERVER_IP`.
This is done wherever your `vairiot.com` domain is managed (your domain registrar
or DNS provider — e.g. GoDaddy, Cloudflare, Namecheap, etc.).

1. Log into that provider's website and find the **DNS** settings for
   `vairiot.com` (often called "DNS records", "Manage DNS", or "Zone editor").
2. Add **two records of type `A`**:

   | Type | Name / Host | Value / Points to | TTL |
   |------|-------------|-------------------|-----|
   | A    | `test`      | `SERVER_IP`       | default / 300 |
   | A    | `testadmin` | `SERVER_IP`       | default / 300 |

   (Some providers want the full `test.vairiot.com` in "Name"; others just `test`.
   Follow the examples they show.)
3. Save. DNS can take a few minutes (sometimes up to an hour) to take effect.
4. Back in your Mac Terminal (a **new** Terminal tab, not the server one), check it:
   ```
   ping -c 1 test.vairiot.com
   ```
   **You should see** your `SERVER_IP` in the output. If it says "cannot resolve",
   wait 10 minutes and try again.

> ✅ **Checkpoint:** `ping test.vairiot.com` shows your server's IP.

---

## 4. Basic server safety (firewall)

Back in the **server** Terminal (the `root@vairiot-staging` one). These commands
allow only web + SSH traffic.

```
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable
```
**You should see** "Firewall is active and enabled on system startup".

---

## 5. Install Docker

Still on the server. Copy-paste this whole block (it's Docker's official
installer), press Enter:

```
apt-get update
apt-get install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```
Then check it works:
```
docker --version
docker compose version
```
**You should see** two version lines (e.g. `Docker version 27...` and
`Docker Compose version v2...`).

---

## 6. Get the Vairiot code onto the server

Still on the server. We'll put it in `/opt/Vairiot` (same place as production, so
the instructions match).

```
mkdir -p /opt/Vairiot
git clone https://github.com/Snookylagoon/Vairiot.git /opt/Vairiot
cd /opt/Vairiot
git checkout audit-remediation
```
- If `git clone` asks for a username/password, that means the repo is private —
  use a GitHub **Personal Access Token** as the password (GitHub → Settings →
  Developer settings → Personal access tokens → generate one with `repo` scope),
  or tell me and I'll give you the token-based clone command.

**You should see**, after `git checkout`, "Switched to branch 'audit-remediation'".

---

## 7. Create the settings file (`.env`)

The app reads its passwords and settings from a file called `.env` at
`/opt/Vairiot/.env`. We'll generate strong random secrets. Still on the server:

1. Generate the secret values (run this once; it prints a ready-made file):
   ```
   cat > /opt/Vairiot/.env <<EOF
   # --- Staging environment ---
   NGINX_CONF=./nginx/staging.conf

   POSTGRES_USER=vairiot
   POSTGRES_PASSWORD=$(openssl rand -hex 24)
   POSTGRES_DB=vairiot

   REDIS_PASSWORD=$(openssl rand -hex 24)

   MINIO_ROOT_USER=vairiotminio
   MINIO_ROOT_PASSWORD=$(openssl rand -hex 24)

   JWT_SECRET=$(openssl rand -hex 32)
   JWT_ACCESS_SECRET=$(openssl rand -hex 32)
   JWT_REFRESH_SECRET=$(openssl rand -hex 32)
   JWT_SETUP_SECRET=$(openssl rand -hex 32)
   APP_ENCRYPTION_KEY=$(openssl rand -hex 32)

   WEB_ORIGIN=https://test.vairiot.com
   VITE_API_URL=https://test.vairiot.com
   EOF
   ```
2. Check it was written (this shows the file **without** the actual secrets
   scrolling past — just confirm the names are there):
   ```
   grep -o '^[A-Z_]*=' /opt/Vairiot/.env
   ```
   **You should see** a list of names like `POSTGRES_USER=`, `JWT_SECRET=`, etc.
3. **Back up this file now.** On your Mac, keep a copy of these secrets in your
   password manager. If you ever lose `APP_ENCRYPTION_KEY`, encrypted data can't
   be recovered. (For staging it's throwaway, but get in the habit.)

> ✅ **Checkpoint:** `/opt/Vairiot/.env` exists and lists all the variable names.

---

## 8. Get the HTTPS certificate

The site uses HTTPS (the padlock). We get a free certificate from Let's Encrypt.
We do this **before** starting nginx, because nginx expects the certificate to
already exist.

Still on the server:

```
apt-get install -y certbot
certbot certonly --standalone \
  -d test.vairiot.com -d testadmin.vairiot.com \
  --non-interactive --agree-tos -m don.scott@kapitimanagement.com
```
- Certbot briefly uses port 80 to prove you own the domains, then saves the
  certificate.
- **You should see** "Successfully received certificate" and paths under
  `/etc/letsencrypt/live/test.vairiot.com/`.

If it fails with a challenge/timeout error, DNS from Step 3 probably hasn't taken
effect yet — wait 15 minutes and run the `certbot` command again.

Create the folder nginx expects for future renewals:
```
mkdir -p /var/www/certbot
```

Set up automatic renewal + reload (so the padlock never expires):
```
echo 'docker exec vairiot_nginx nginx -s reload' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

---

## 9. Start everything

Still on the server:

```
cd /opt/Vairiot
bash infra/deploy.sh
```
This pulls the latest code, **builds all the containers** (this takes 3–8 minutes
the first time — lots of text will scroll, that's normal), runs the database
migrations, and starts everything.

**You should see**, at the end, a table listing containers with status `Up` and
several marked `(healthy)`.

If the build stops with an "out of memory" error, your server is too small —
recreate it as a CPX31 (8 GB) per Step 1.

---

## 10. Check it's alive

1. On the server, list the containers:
   ```
   docker ps
   ```
   **You should see** `vairiot_nginx`, `vairiot_api`, `vairiot_web`,
   `vairiot_admin`, `vairiot_worker`, `vairiot_postgres`, `vairiot_redis`,
   `vairiot_minio`, `vairiot_reports` — most saying `(healthy)`.
2. Ask the API if it's ready:
   ```
   curl -k https://test.vairiot.com/health/ready
   ```
   **You should see** something like `{"status":"ok"...}`.
3. On your **Mac**, open a browser and go to **https://test.vairiot.com**.
   **You should see** the Vairiot login page with a padlock in the address bar.
   The admin panel is at **https://testadmin.vairiot.com**.

> ✅ **Checkpoint:** the test site loads in your browser over HTTPS. 🎉 The staging
> server is ready. Steps 1–10 are one-time; from now on you only use Step 11 to
> load new changes.

---

## 11. Loading new changes (redeploy) — you'll do this often

Whenever I push a new batch, you pull and redeploy on the **server**:

```
ssh root@SERVER_IP
cd /opt/Vairiot
bash infra/deploy.sh
```
That's the whole loop. It rebuilds only what changed, runs any new database
migrations automatically, and reloads. Wait for the container table at the end,
then re-test in your browser.

To switch to a specific branch I tell you about:
```
cd /opt/Vairiot
git fetch
git checkout THE-BRANCH-NAME
git pull
bash infra/deploy.sh
```

---

## 12. Creating a test login (in the app)

The very first user/organisation is created through the app's sign-up flow:

1. Go to **https://test.vairiot.com**.
2. Click **Register** / **Sign up** and create a test organisation and admin user
   (use any test email + a 12-character password — see the per-feature test plans
   in `docs/TEST-PLAN.md`).
3. Follow the onboarding steps. You now have data to test with.

(If you'd rather load realistic sample data, tell me and I'll give you the seed
command — but on staging the sign-up flow is the simplest start.)

---

## 13. Troubleshooting

**"cannot resolve test.vairiot.com" / site won't load**
DNS hasn't propagated or the A records are wrong. Re-check Step 3;
`ping test.vairiot.com` from your Mac should show `SERVER_IP`.

**Browser says "Not secure" / certificate error**
The certificate step (8) didn't complete, or nginx started before it existed.
On the server: `ls /etc/letsencrypt/live/test.vairiot.com/` — you should see
`fullchain.pem`. If not, re-run the `certbot certonly` command, then
`bash infra/deploy.sh`.

**`bash infra/deploy.sh` shows lots of `WARN: variable is not set`**
The `.env` file is missing or in the wrong place. It must be at
`/opt/Vairiot/.env`. Redo Step 7.

**A container keeps restarting / not `(healthy)`**
See its logs (replace the name):
```
docker logs vairiot_api --tail 50
```
Copy the errors and send them to me.

**Out of memory during build**
Recreate the server as CPX31 (8 GB) — Step 1.

**I want to wipe staging and start clean**
On the server:
```
cd /opt/Vairiot
docker compose --env-file .env -f infra/docker-compose.prod.yml down -v
bash infra/deploy.sh
```
`down -v` deletes the staging database and files (safe on staging — **never** run
`-v` on production).

**Stop paying when not testing**
In the Hetzner console you can **Power off** the server (stops most charges except
a small fee for the reserved IP/disk) or **Delete** it entirely. Recreating from
this guide takes ~15 minutes.

---

## What to send me if you're stuck

1. Which step number.
2. The command you ran.
3. The last ~15 lines of output (copy-paste as text).

I'll get you unstuck.
