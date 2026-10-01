# Security Policy

## Supported versions

Security fixes are made on the latest release line (currently **2.x**) on the `master` branch.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**.

Include as much as you can: affected version or commit, steps to reproduce, the impact you observed, and a suggested fix if you have one. You will get an acknowledgement as soon as possible, and we will keep you updated until a fix is released. Please give us reasonable time to fix the issue before disclosing it.

Issues that break **tenant isolation** — reading or changing another organization's, division's, or outlet's data — are treated as critical.

## Known limitations

These are known and planned for upcoming releases (see the roadmap in the [README](README.md#roadmap)); reports about them are still welcome if you find a concrete exploit:

- There is no login rate limiting, password reset, or email verification yet. Run the app behind a reverse proxy that provides HTTPS and rate limiting.
- Publishing through the built-in **Cloudflare Tunnel** puts the login page on the public internet. Until rate limiting lands, add a Cloudflare rate limiting rule for `/api/auth/login` or protect the site with Cloudflare Access. Quick Tunnel addresses (`*.trycloudflare.com`) are meant for trials — anyone with the link reaches the login page. Keep `CLOUDFLARE_TUNNEL_TOKEN` secret and rotate it in the Cloudflare dashboard if it leaks.
- The Docker volume stores the generated JWT secret and database password in `/data/secrets`. Treat backups of the volume like credentials.
- `saas` mode has no public sign-up and is not ready for hosting untrusted organizations.
- The demo seed creates accounts with fixed passwords. Do not run it against a production database, and change or remove those accounts on real installations.
