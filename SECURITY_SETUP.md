# Security Setup

The app now reads `.env` automatically from the project root.

1. Copy `.env.example` to `.env`
2. Replace the sample values
3. Start the app normally

You can still use environment variables directly if you prefer.

## Local development

```powershell
DJANGO_DEBUG="True"
DJANGO_SECRET_KEY="replace-with-long-random-string"
DJANGO_ALLOWED_HOSTS="127.0.0.1,localhost"
ADMIN_PASSWORD="replace-admin-password"
EVENT_JOIN_KEY="replace-event-join-key"
```

## Production

```powershell
DJANGO_DEBUG="False"
DJANGO_SECRET_KEY="replace-with-long-random-string"
DJANGO_ALLOWED_HOSTS="your-domain.com"
DJANGO_CSRF_TRUSTED_ORIGINS="https://your-domain.com"
ADMIN_PASSWORD="replace-admin-password"
EVENT_JOIN_KEY="replace-event-join-key"
```

Optional production overrides:

```powershell
DJANGO_SECURE_SSL_REDIRECT="True"
DJANGO_SESSION_COOKIE_SECURE="True"
DJANGO_CSRF_COOKIE_SECURE="True"
DJANGO_SECURE_HSTS_SECONDS="31536000"
DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS="True"
DJANGO_SECURE_HSTS_PRELOAD="True"
```
