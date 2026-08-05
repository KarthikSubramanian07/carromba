# Security policy

Carromba is a static browser game with no accounts, no personal data, and no
runtime dependencies in the shipped site. The only server piece is a small
Cloudflare Worker that relays online moves and stores nothing beyond a room's
current board while a game is in progress.

## Reporting a vulnerability

If you find a security issue, please report it privately rather than opening a
public issue. Use GitHub's [private vulnerability reporting](https://github.com/KarthikSubramanian07/carromba/security/advisories/new)
on this repository. I will confirm receipt, look into it, and credit you if you
would like once a fix is out.

Since there is no user data or authentication, the realistic surface is small:
the online relay, the content security policy, and the build/dependency chain.
Reports in those areas are especially welcome.

## Supported versions

The game is deployed continuously from `main`, so the live site always reflects
the latest commit. Fixes land on `main` and deploy from there.
