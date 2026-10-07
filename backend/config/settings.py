from pathlib import Path
from dotenv import load_dotenv
import os
from datetime import timedelta

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ImproperlyConfigured(
        "SECRET_KEY environment variable is required. Set it in backend/.env "
        "(a strong random value, never committed to source control)."
    )

DEBUG = os.getenv("DEBUG", "False").lower() in ("true", "1", "yes")

KCCC_ENABLE_INTERNAL_PREVIEWS = os.getenv("KCCC_ENABLE_INTERNAL_PREVIEWS", "false").lower() in ("true", "1", "yes")

ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv(
        "ALLOWED_HOSTS",
        "localhost,127.0.0.1,0.0.0.0"
    ).split(",")
    if host.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",

    "rest_framework",
    "corsheaders",

    "accounts",
    "core",
    "audit",
    "climate_risk",
    "ghg",
    "projects",
    "reports",
    "public_portal",
    "remote_sensing",
    "infrastructure",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Platform runtime (e.g. shared Postgres/PostGIS infrastructure) supplies a
# single DATABASE_URL. Local development and CI continue to work unchanged
# via the discrete DATABASE_* vars when DATABASE_URL is not set. parse()
# defaults to the plain "django.db.backends.postgresql" engine — the shared
# instance may run PostGIS, but nothing here requires the GeoDjango backend,
# since no model currently uses a GIS field (see backend/infrastructure/models.py).
_DATABASE_URL = os.getenv("DATABASE_URL")

if _DATABASE_URL:
    DATABASES = {
        "default": dj_database_url.parse(_DATABASE_URL),
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("DATABASE_NAME"),
            "USER": os.getenv("DATABASE_USER"),
            "PASSWORD": os.getenv("DATABASE_PASSWORD"),
            "HOST": os.getenv("DATABASE_HOST", "localhost"),
            "PORT": os.getenv("DATABASE_PORT", "5432"),
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = os.getenv("TIME_ZONE", "Africa/Lagos")
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Existing explicit variables (FRONTEND_URL, CORS_ALLOWED_ORIGINS,
# CSRF_TRUSTED_ORIGINS) always win when set — kept for local dev/CI
# backward compatibility. The platform-standard PUBLIC_URL / ALLOWED_ORIGINS
# vars are supported fallbacks, used only when the explicit var is absent.
_DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"


def _origins_from_env(*env_names, default):
    for name in env_names:
        raw = os.getenv(name)
        if raw:
            return [origin.strip() for origin in raw.split(",") if origin.strip()]
    return [origin.strip() for origin in default.split(",") if origin.strip()]


FRONTEND_URL = os.getenv("FRONTEND_URL") or os.getenv("PUBLIC_URL", "http://localhost:5173")

CORS_ALLOWED_ORIGINS = _origins_from_env(
    "CORS_ALLOWED_ORIGINS", "ALLOWED_ORIGINS", default=_DEFAULT_ORIGINS
)

CSRF_TRUSTED_ORIGINS = _origins_from_env(
    "CSRF_TRUSTED_ORIGINS", "ALLOWED_ORIGINS", default=_DEFAULT_ORIGINS
)

REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.getenv("REST_THROTTLE_ANON_RATE", "100/hour"),
        "user": os.getenv("REST_THROTTLE_USER_RATE", "1000/hour"),
        # Tighter scope specifically for the login endpoint (brute-force
        # protection) — applied via ScopedRateThrottle on ThrottledTokenObtainPairView.
        "login": os.getenv("REST_THROTTLE_LOGIN_RATE", "5/min"),
    },
}

DATA_UPLOAD_MAX_MEMORY_SIZE = 25 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 25 * 1024 * 1024

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=8),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": False,
}

if not DEBUG:
    SECURE_SSL_REDIRECT = os.getenv("SECURE_SSL_REDIRECT", "True").lower() in ("true", "1", "yes")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = "DENY"

# Console-only logging (stdout/stderr) so any hosting platform's own log
# capture (container logs, systemd journal, PaaS log stream, etc.) picks
# this up with no file-path/rotation assumptions baked in here. Only
# request paths, status codes and exception messages are logged — never
# request bodies, headers, or credentials.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": os.getenv("DJANGO_LOG_LEVEL", "INFO"),
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": os.getenv("DJANGO_LOG_LEVEL", "INFO"),
            "propagate": False,
        },
        # Unhandled exceptions / 5xx responses — the gap flagged in the
        # monitoring audit ("backend exceptions vanish with nothing
        # captured"). Kept separate from the general django logger so 4xx
        # noise doesn't bury real errors.
        "django.request": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
    },
}