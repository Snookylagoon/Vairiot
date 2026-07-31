# Developing safely: Vairiot-dev → test site → live site

You now have **two copies** of the project on your Mac, and each one feeds a
different website:

```
/Volumes/DRSssd/Projects/GitHub/Vairiot-dev   (branch: dev)
        │  ./scripts/deploy-dev.sh "message"
        ▼
https://test.vairiot.com          ← the TEST site. Break it freely.
https://testadmin.vairiot.com       (test admin panel)

        │  ./scripts/go-live.sh   (only after testing!)
        ▼
https://vai.vairiot.com           ← the LIVE site your users see.
```

- **Vairiot-dev** (`/Volumes/DRSssd/Projects/GitHub/Vairiot-dev`) — where you
  build new functions and attributes. It is on the `dev` branch.
- **Vairiot** (`/Volumes/DRSssd/Projects/GitHub/Vairiot`) — the production copy,
  on the `main` branch. Only touch this for emergency live fixes.

Both folders are clones of the **same GitHub repository**
(`Snookylagoon/Vairiot`) — they just sit on different branches, so going live is
a clean merge, never a copy-paste between projects.

---

## Day-to-day: build and test a new feature

1. Open Terminal and go to the dev folder:
   ```
   cd /Volumes/DRSssd/Projects/GitHub/Vairiot-dev
   ```
2. Make your changes (or have Claude make them) in this folder.
3. Deploy them to the test site with one command — use a short description of
   what you changed inside the quotes:
   ```
   ./scripts/deploy-dev.sh "add asset export button"
   ```
   This commits your work, pushes it to GitHub, rebuilds the test server, and
   checks the site is up. It takes a few minutes.
4. Open **https://test.vairiot.com** (and **https://testadmin.vairiot.com** for
   admin features) and try out your change. Test logins are in
   `docs/Test login for Test and Test Admin.docx`.
5. Not right yet? Change the code and run step 3 again. Repeat as often as you
   like — the test site is yours to break.

## Going live

6. When the change works on the test site, run:
   ```
   ./scripts/go-live.sh
   ```
7. It shows a warning and asks you to type `live` to confirm. It then merges
   `dev` into `main`, pushes to GitHub, rebuilds the production server, and
   checks the live site is up.
8. Open **https://vai.vairiot.com** and confirm your change is there.

## If something goes wrong

- **Test site broken after a deploy** — that's what it's for. Fix the code and
  run `./scripts/deploy-dev.sh "fix ..."` again. To see server errors:
  ```
  ssh vairiot-dev 'docker logs --tail 100 vairiot_api'
  ```
- **Live site broken after go-live** — redeploy the previous state:
  ```
  cd /Volumes/DRSssd/Projects/GitHub/Vairiot
  git checkout main && git pull
  git revert --no-edit -m 1 HEAD
  git push origin main
  ssh vairiot 'bash /opt/Vairiot/infra/deploy.sh'
  ```
  Then fix properly on the dev branch and go live again.

## Notes

- **Mobile apps are separate.** `deploy-dev.sh` / `go-live.sh` deploy the web
  app, admin panel, API, worker and reports. Android/iOS builds still follow
  the existing release process (build release APK → upload to admin panel;
  iOS via `build-adhoc.sh --publish`).
- The test server shares a machine with other sites (memberforge / club-x.uk).
  Its own nginx fronts everything — never edit the host nginx configs except
  additively, and run `nginx -t` before reloading.
- Server aliases in `~/.ssh/config`: `vairiot` = production (81.85.92.155),
  `vairiot-dev` = test server (167.233.56.159).
