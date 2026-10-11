# KS-CCC (K3C) – Kaduna State Climate Command Center

A climate information platform for Kaduna State: a public Climate Atlas and reports for the public, and a
staff portal for managing greenhouse-gas (GHG) inventories, climate-risk data, projects and reports.

- **Public portal:** Home, Climate Intelligence (climate risk), Climate Atlas, GHG Inventory, Projects, Reports.
- **Staff portal:** login-protected tools to manage GHG inventory entries, climate-risk profiles and uploads,
  the project portfolio, health facilities, reports and an audit trail.
- **Data:** satellite-derived climate layers (rainfall, NDVI, land surface temperature, drought index, land cover)
  summarised for the 23 Local Government Areas (LGAs) of Kaduna State.

Status: staging. Public release of climate layers is gated (see [Publication and release controls](#publication-and-release-controls)).

---

## Contents

1. [Architecture](#architecture)
2. [Repository layout](#repository-layout)
3. [Technology](#technology)
4. [Quick start (local development)](#quick-start-local-development)
5. [Configuration](#configuration)
6. [API overview](#api-overview)
7. [Users, roles and security](#users-roles-and-security)
8. [Loading data](#loading-data)
9. [Importing health facilities](#importing-health-facilities)
10. [Google Earth Engine](#google-earth-engine)
11. [Publication and release controls](#publication-and-release-controls)
12. [Testing and CI](#testing-and-ci)
13. [Container images and deployment](#container-images-and-deployment)
14. [Git workflow](#git-workflow)
15. [Troubleshooting](#troubleshooting)
16. [More documentation](#more-documentation)

---

## Architecture

```
Google Earth Engine  ->  Django + PostgreSQL/PostGIS  ->  Django REST API  ->  React (Vite)
   (satellite data)       (stored LGA statistics)         (JSON, JWT auth)     (public + staff UI)
```

Rules the code follows:

- **The browser never calls Google Earth Engine.** Earth Engine is used only by backend sync commands, which store
  the results in PostgreSQL. React reads everything through the REST API.
- **Plain PostgreSQL features today.** The database server may be PostGIS, but no model uses a GIS field yet, so the
  backend uses Django's standard `postgresql` engine. Facility locations are stored as latitude/longitude decimals
  (see `backend/infrastructure/models.py` for the PostGIS upgrade path).
- **Migrations are explicit.** The backend image does not run migrations or `collectstatic` at start-up; the
  deploying platform runs them as separate, reviewed steps.

## Repository layout

```
.
|-- backend/                    Django project (Python)
|   |-- config/                 settings, URL routing, WSGI
|   |-- accounts/               login (JWT), user profiles, roles
|   |-- core/                   LGA registry, GWP values, emission factors, health check
|   |-- ghg/                    GHG inventory entries, approval workflow, sector factors
|   |-- climate_risk/           risk profiles, parameter records, dataset uploads
|   |-- remote_sensing/         climate layers, LGA metrics, land cover, Earth Engine sync commands
|   |-- infrastructure/         health facilities (model, API, CSV import)
|   |-- projects/               climate project portfolio
|   |-- reports/                report documents
|   |-- public_portal/          public (no-login) API for the portal
|   |-- audit/                  audit log
|   |-- backups/                land-cover fixture and summary CSV (2018-2025)
|   |-- Dockerfile              API image (Gunicorn)
|   `-- requirements.txt
|-- frontend/                   React + Vite single-page app
|   |-- public/data/            Kaduna boundary GeoJSON (state, LGA, ward) served as static files
|   |-- Dockerfile              static-file image (unprivileged Nginx)
|   `-- nginx.conf
|-- docs/                       project state, QA report, roadmap, CSV templates
|-- docker-compose.yml          local PostGIS + Redis for development
|-- .env.example                settings for docker-compose.yml
`-- .github/workflows/ci.yml    tests, lint, build, image publishing
```

## Technology

| Area | Details |
|---|---|
| Backend | Python 3.12, Django 6.0, Django REST Framework 3.17, SimpleJWT 5.5 (login tokens), django-cors-headers, WhiteNoise, Gunicorn, psycopg 3, dj-database-url, SciPy, Pillow |
| Satellite data | `earthengine-api` (Google Earth Engine) |
| Database | PostgreSQL 16 or later; the project uses PostGIS 3.5 images |
| Frontend | React, Vite, Tailwind CSS, React Router, Axios, Leaflet / react-leaflet, Mapbox GL |
| CI | GitHub Actions: Django check and tests, ESLint, Vite build, Docker image build and push |

## Quick start (local development)

**You need:** Python 3.12, Node.js 22, Docker (for a local database), and Git.

### 1. Start a local database

```bash
cp .env.example .env            # then set POSTGRES_PASSWORD in .env
docker compose up -d            # PostGIS on port 5432 (and a Redis container)
```

`docker-compose.yml` also starts Redis. The current backend dependencies do not use it.

### 2. Run the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env             # edit: SECRET_KEY and the DATABASE_* values (must match the root .env)
python manage.py migrate
python manage.py seed_core       # reference data: 23 LGAs, GWP values, NDC constants
python manage.py createsuperuser
python manage.py runserver       # http://127.0.0.1:8000
```

The API checks `SECRET_KEY` at start-up and refuses to run without it. See
[Loading data](#loading-data) for the remaining seed commands.

### 3. Run the frontend

```bash
cd frontend
npm ci
npm run dev                      # http://localhost:5173
```

The frontend calls the API at `/api` on the same host. During local development the Vite dev server already
forwards `/api`, `/media` and `/static` to the backend at `http://127.0.0.1:8000` (see `frontend/vite.config.js`),
so no extra setting is needed. To point at a different API, set `VITE_API_BASE_URL` in `frontend/.env`.

### Useful commands

| Task | Command |
|---|---|
| Backend tests | `cd backend && python manage.py test` |
| Tests of one app | `python manage.py test infrastructure` |
| Django system check | `python manage.py check` |
| Frontend lint | `cd frontend && npm run lint` |
| Frontend production build | `npm run build` |

## Configuration

### Backend environment variables

Set these in `backend/.env` locally, or as real environment variables in a deployment. Never commit real values.

| Variable | Purpose | Default / notes |
|---|---|---|
| `SECRET_KEY` | Django signing key | **Required.** Use a long random value, different per environment |
| `DEBUG` | Debug mode | `False`. Only `True` for local development |
| `DATABASE_URL` | Full database connection URL | If set, it replaces the `DATABASE_*` values below (used by the shared platform) |
| `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_HOST`, `DATABASE_PORT` | Separate connection settings for local development and CI | Host `localhost`, port `5432` |
| `ALLOWED_HOSTS` | Host names Django answers to (comma-separated) | Add the deployed host name or address |
| `CORS_ALLOWED_ORIGINS` | Browser origins allowed to call the API | Exact scheme + host + port. Falls back to `ALLOWED_ORIGINS` |
| `CSRF_TRUSTED_ORIGINS` | Origins trusted for Django Admin form posts | Falls back to `ALLOWED_ORIGINS` |
| `PUBLIC_URL`, `ALLOWED_ORIGINS` | Platform-standard settings. `ALLOWED_ORIGINS` feeds both CORS and CSRF unless the explicit variables above are set | `FRONTEND_URL` falls back to `PUBLIC_URL` |
| `SECURE_SSL_REDIRECT` | Redirect HTTP to HTTPS when `DEBUG` is off | `True`. Set `False` for an HTTP-only staging server |
| `SECURE_HSTS_SECONDS` | HSTS lifetime when `DEBUG` is off | `31536000` |
| `TIME_ZONE` | Server time zone | `Africa/Lagos` |
| `REST_THROTTLE_ANON_RATE`, `REST_THROTTLE_USER_RATE`, `REST_THROTTLE_LOGIN_RATE` | API rate limits | `100/hour`, `1000/hour`, `5/min` |
| `GEE_PROJECT`, `GEE_SERVICE_ACCOUNT`, `GEE_PRIVATE_KEY_FILE` | Google Earth Engine access | If the service account and key file are blank, Application Default Credentials are used |
| `DJANGO_LOG_LEVEL` | Log level | Logs go to the console only |
| `KCCC_ENABLE_INTERNAL_PREVIEWS` | Enables internal-only tile previews | `false`. Only works together with `DEBUG=True` and a localhost request |

The `ALLOWED_ORIGINS` setting must contain the exact address people use in the browser, including the port number
if the site is served on one. If you change the public address, update `PUBLIC_URL` and `ALLOWED_ORIGINS`, then
restart the API, or logins and API calls will be refused.

### Frontend build settings

These are baked in when the frontend is built (build arguments in `frontend/Dockerfile`):

| Variable | Purpose | Default |
|---|---|---|
| `VITE_API_BASE_URL` | Where the app finds the API | `/api` (same host) |
| `VITE_MAPBOX_TOKEN` | Mapbox access token for base maps | empty |
| `VITE_PUBLIC_DEMO_MODE` | Public demo mode switch | `full` |
| `VITE_ANALYTICS_ENABLED` | Page analytics on or off | `false` (analytics uses `VITE_UMAMI_URL` and `VITE_UMAMI_WEBSITE_ID` when enabled) |

## API overview

All routes start with `/api/`. The default for the API is **login required** (JWT bearer token); public portal and
a few operational routes are open and are marked below.

| Prefix | What it provides |
|---|---|
| `health` (open) | Platform health check. Also reports whether the database is reachable |
| `core/` | `health/`, `lgas/` (the 23 LGAs), `foundation/` (reference data) |
| `accounts/` | `token/` (log in), `token/refresh/`, `me/`, `users/` (user management) |
| `ghg/` | GHG inventory entries, review and approval, emission factors |
| `risk/` | Climate-risk profiles, parameter records, dataset uploads |
| `portfolio/` | Climate project portfolio |
| `reports/` | Report documents |
| `audit/` | Audit log |
| `infrastructure/health-facilities/` | Health facilities (list, filters, `summary/`). Login required |
| `public/` (open) | `summary/`, `climate-risk/`, `ghg-inventory/`, `projects/`, `reports/`, `atlas-export/` |
| `layers/` (open) | Climate Atlas layer catalogue. Lists only layers that are both active and public |
| `gee/status/`, `tiles/url/<layer>/`, `climate/lga-stats/`, `climate/lga-profile/<lga>/`, `dashboard/kpis/` | Climate Atlas data and map tiles |

Authentication and limits:

- Log in with `POST /api/accounts/token/` to receive an access token (valid 8 hours) and a refresh token
  (valid 7 days). Send `Authorization: Bearer <access token>` on later requests.
- Default rate limits are 100 requests/hour for anonymous callers, 1000/hour for logged-in users and
  5/minute for the login route. They can be changed with the `REST_THROTTLE_*` variables.
- List endpoints are paginated.

Health facility filters: `?lga=<lga id>`, `?lga_name=<text>`, `?facility_type=`, `?functional_status=`, `?ward=`.

## Users, roles and security

Each user has a profile with a **role** and an optional **sector** and **LGA** assignment.

| Role | Intended use |
|---|---|
| `admin` | Manage users, data and releases |
| `analyst` | Review and analyse data |
| `sector_focal_point` | Submit data for an assigned sector (default role) |
| `public` | Public access level |

Sectors: Energy, Agriculture, LULUCF, Waste, IPPU, Projects, None.

Security notes:

- Secrets stay out of the repository. `SECRET_KEY` is mandatory, and `DEBUG` must be `False` outside development.
- With `DEBUG=False` the app turns on secure cookies, HSTS, content-type protection and a deny-framing header.
  If you serve staging over plain HTTP, set `SECURE_SSL_REDIRECT=False`.
- Log output is console-only and contains request paths, status codes and exception messages, never request
  bodies, headers or credentials.
- File uploads are limited to 25 MB.

## Loading data

Run these from `backend/` after `python manage.py migrate`. All seed commands are safe to re-run
(they update existing rows instead of creating duplicates).

| Step | Command | Result |
|---|---|---|
| 1. Reference data | `seed_core` | 23 LGAs, 3 GWP values, NDC constant, equivalency factors |
| 2. Emission factors | `seed_energy_factors`, `seed_agriculture_factors`, `seed_ippu_factors`, `seed_lulucf_factors`, `seed_waste_factors` | Sector emission factors |
| 3. Climate-risk profiles | `seed_risk_profiles` | Development risk profiles, one per LGA |
| 4. Climate layer definitions | `seed_remote_sensing_layers` | The 13 layer definitions, with no climate values |
| 5. Layer metrics | `import_remote_sensing_metrics <csv>` | Real LGA metrics from a CSV (no fake values are generated) |
| 6. Satellite syncs | `sync_climate_atlas`, `sync_gee_ndvi`, `sync_elevation`, `sync_flood_occurrence`, `sync_lulc` | Requires Earth Engine, see [below](#google-earth-engine) |
| 7. Derived layers | `build_rainfall_anomaly`, `build_drought_conditions` | Database-only, no Earth Engine calls |
| 8. Health facilities | `import_health_facilities <csv>` | See [Importing health facilities](#importing-health-facilities) |

**Land cover (Dynamic World 2018-2025).** `backend/backups/` contains a Django fixture
(`lulc_dynamic_world_2018_2025_fixture.json`: 8 datasets, 184 snapshots = 23 LGAs x 8 years) and a matching summary CSV.
The fixture can be loaded into a fresh database with `python manage.py loaddata backups/lulc_dynamic_world_2018_2025_fixture.json`.
The QA report is in `docs/lulc_dynamic_world_2018_2025_qa.md`.

**GHG preview inventory.** `seed_preview_ghg --batch-id KCCC_GHG_PREVIEW_2026_V1` creates a temporary preview batch
of GHG entries for public demonstration (that is the only batch id the command accepts, and the id is stored in each
entry's `notes` field). Use `--dry-run` to see what would change; without it, the command refuses to write unless you
also pass `--confirm`. It is idempotent: re-running updates the batch and removes entries no longer in its
definition. `clear_preview_ghg --batch-id <id>` removes the batch. Treat preview data as placeholder data,
not as an official inventory.

**Boundary files.** The state, LGA and ward GeoJSON files in `frontend/public/data/` are static files served with the
frontend. They are not loaded into the database.

## Importing health facilities

Command: `python manage.py import_health_facilities <csv-path> [--update-existing]`
Template: `docs/templates/health_facilities_template.csv`

### CSV columns

| Column | Required | Rules |
|---|---|---|
| `name` | yes | Facility name |
| `lga_name` | yes | LGA name. It is matched to the LGA registry, ignoring upper/lower case |
| `facility_type` | yes | `phc`, `secondary`, `tertiary`, `clinic`, `maternity`, `dispensary` or `other` |
| `functional_status` | no | `functional`, `partial`, `non_functional` or `unknown` (default `unknown`) |
| `ownership` | no | `public`, `private`, `faith_based` or `ngo` (default `public`) |
| `state` | no | Default `Kaduna` |
| `ward` | no | Ward name |
| `latitude`, `longitude` | no | Decimal degrees, up to 7 decimal places |
| `bed_capacity`, `population_served` | no | Whole numbers |

### How the import behaves

- A facility is identified by **name + LGA name**. Two different facilities with the same name in the same LGA
  must have different names in the CSV (for example, add the ward) or the second one is treated as a duplicate.
- By default, rows that already exist are **skipped**. With `--update-existing`, existing rows are updated.
- Rows with an empty name or LGA, or an invalid type, status or ownership, are skipped and listed in the summary
  (the first 20 are shown).
- **LGA link.** Besides the LGA name, each facility gets a link to its record in the LGA registry. The API's
  `?lga=<id>` filter and the by-LGA summary depend on that link.
  - New rows get the link automatically.
  - Existing rows that are still unlinked are linked when they are met again (even without `--update-existing`);
    their other data is left as it was.
  - If an LGA name does not match the registry, the facility is still imported, its link is left empty, and the
    command prints the unmatched names so you can correct them.
- The command prints `Created`, `Updated` and `Skipped` counts, plus a note for any links it filled in.

### Example

```bash
python manage.py import_health_facilities /path/to/kaduna_health_facilities.csv
# Import complete. Created: 1537. Updated: 0. Skipped: 0.
```

### Preparing a CSV from the national facility register (NHFR / GRID3)

The staging server was loaded from the national register (about 51,000 facilities, all states) like this:

1. Keep only rows where `state` is Kaduna.
2. Map LGA names to the registry spelling (for example `Jema'A` becomes `Jema'a`). Set aside rows whose LGA is not
   one of Kaduna's 23, since the source often flags those as disputed.
3. Map facility type from the register's `facility_level`:
   tertiary -> `tertiary`; secondary -> `secondary`; primary and private -> `clinic`;
   primary "Health Post" -> `dispensary`; any other primary -> `phc`.
4. Map ownership: Public -> `public`, Private -> `private`. Unknown ownership has no equivalent, so review those rows
   by hand; a blank value imports as `public`.
5. Leave `functional_status`, `bed_capacity` and `population_served` blank when the source does not provide them.
6. Make repeated names unique by adding the ward, for example `Kudan Primary Health Center - Zabi (Kubau)`.

## Google Earth Engine

- Sync commands (`sync_*`) call Earth Engine and save results as LGA statistics. Each run is recorded in a sync log
  you can inspect in the database or the admin (`RemoteSensingSyncLog`, with status, message and details). The
  orchestrator `sync_climate_atlas` builds a sequential, resumable task plan.
- Syncs can fail (for example "Computation timed out" from Earth Engine): check the sync log, then re-run.
  Commands that support it (such as `sync_lulc` with its skip-existing option) do not repeat work already stored.
- Configure access with `GEE_PROJECT` and either a service account (`GEE_SERVICE_ACCOUNT` plus `GEE_PRIVATE_KEY_FILE`)
  or Application Default Credentials. `GET /api/gee/status/` reports whether Earth Engine is initialised.
- Check the Earth Engine non-commercial quota before scheduling large back-fills.
- A server without Earth Engine credentials still serves all stored data. Only new syncs and live map tiles need
  Earth Engine.

Layer coverage (approved start years): rainfall, rainfall anomaly and drought index (SPI) 1981; NDVI from Sentinel-2
2018 and historical NDVI from Landsat 1985-2017; land surface temperature (MODIS) 2001; annual land cover
(Dynamic World) 2018. Scientific wording rules (for example, SPI is precipitation-only; LST is not air temperature)
are in `docs/KCCC_PROJECT_STATE.md`.

## Publication and release controls

Data is private until it is explicitly released. **Validated does not mean public.**

- Each climate layer has `is_active` and `is_public`; the public `/api/layers/` lists only layers that are both.
  Land-cover datasets have `is_public` and `is_validated` flags.
- Use the release commands, which run as a **dry run by default** and enforce allow-lists:
  - `release_layer` publishes or unpublishes selected Climate Atlas layers and writes a traceable audit record.
  - `release_lulc` publishes or unpublishes the Dynamic World land-cover baseline (late wet season, 2018-2025).
- Do not change `is_public`, `release_layer`, `release_lulc` or the public layer allow-lists without explicit
  QA and release approval.
- The Atlas selector shows only an approved subset: `rainfall`, `ndvi`, `ndvi_landsat`, `lst`, `rainfall_anomaly`
  and `drought_index`. New catalogue entries must not appear publicly by accident.
- Land cover is experimental in Phase 1 and stays unpublished until the release is approved.

## Testing and CI

Continuous integration (`.github/workflows/ci.yml`) runs on pushes and pull requests to `main` and `develop`:

1. **Backend:** Python 3.12, PostGIS 16 service, `python manage.py check`, then `python manage.py test`.
2. **Frontend:** Node 22, `npm ci`, `npm run lint`, `npm run build`.
3. **Build and push images** (direct pushes to `main` or `develop` only, after both jobs pass): builds
   `ksccc-api` and `ksccc-frontend` and publishes them to GitHub Container Registry. CI does not deploy anywhere.

To reproduce CI locally, use a database as in [Quick start](#quick-start-local-development) and run
`python manage.py test`. For repeatable test runs set `REST_THROTTLE_ANON_RATE` and `REST_THROTTLE_USER_RATE`
to a high value (CI uses `100000/hour`).

## Container images and deployment

**Images.** Each push to `develop` or `main` publishes two images to `ghcr.io/<owner>/`:

| Image | Contents |
|---|---|
| `ksccc-api` | Django app under Gunicorn (2 workers), runs as a non-root user, port 8000 |
| `ksccc-frontend` | Built single-page app served by unprivileged Nginx, port 8080 |

Tags: `sha-<first 7 characters of the commit>` (immutable) and a moving tag (`develop`, or `latest` for `main`).
The frontend image has no host name or IP baked in, so the same image works in any environment.

**Running it.** This repository builds the images; it does not deploy them. Deployment is handled by the
shared platform repository **quintessence-infrastructure**, which runs the containers behind a reverse proxy with
a PostGIS database. On the staging server, the latest successful `develop` build is picked up automatically. A deploy
takes a database backup, applies migrations, restarts the containers, checks that `/api/health` is healthy, and rolls
back to the previous version if the check fails. Migrations are not reversed automatically. The staging address and
operating details are in the infrastructure repository's documentation.

## Git workflow

- Never develop directly on `main`. `develop` is the staging integration branch; `main` is for production-approved
  releases.
- Pull the latest `develop`, create a feature branch, commit only the relevant files, push, and open a pull request
  into `develop`.
- Before a staging release: CI must pass, migrations must be reviewed, API health must pass, the frontend must
  load, and the publication gates must remain correct.
- Never commit `.env` files, passwords, API tokens, SSH keys or database credentials.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| The API fails to start with a message about `SECRET_KEY` | `SECRET_KEY` is not set. Set it in `backend/.env` or the environment |
| Logins or requests are refused after changing the site address or port | `ALLOWED_ORIGINS` / `PUBLIC_URL` (or `CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS`) do not match the address in the browser. Update them and restart the API |
| `Bad Request (400)` from the API | The host name is missing from `ALLOWED_HOSTS` |
| Browser redirected to HTTPS on a test server | `SECURE_SSL_REDIRECT` defaults to `True` when `DEBUG` is off. Set it to `False` for HTTP-only staging |
| `/api/layers/` returns an empty list | No layer is both active and public yet. This is expected until layers are released (see above) |
| `/api/gee/status/` reports `not configured` | Earth Engine credentials are not set. Stored data still works; only syncs and live tiles need them |
| Health facilities do not appear under an LGA filter | Facilities were loaded without the LGA link (older versions of the import). Re-run `import_health_facilities` with the same CSV; it fills in missing links |
| Import prints `LGA name not found in the LGA registry` | A spelling in the CSV differs from the registry. Fix the CSV spelling (see `GET /api/core/lgas/`) and re-run |
| Health facility endpoint returns 401 | It needs a login. Get a token from `/api/accounts/token/` |

## More documentation

| File | Contents |
|---|---|
| `docs/KCCC_PROJECT_STATE.md` | Current architecture, public routes, layer coverage, release state, next approved work |
| `docs/lulc_dynamic_world_2018_2025_qa.md` | QA report for the land-cover dataset |
| `docs/climate-atlas-derived-metrics-roadmap.md` | Plan for derived climate metrics |
| `docs/templates/health_facilities_template.csv` | Health facility import template |
| `frontend/README.md` | Notes from the Vite + React template |
