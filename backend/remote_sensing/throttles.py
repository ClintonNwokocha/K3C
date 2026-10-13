from django.conf import settings
from rest_framework.throttling import SimpleRateThrottle


class ClimateAssistantRateThrottle(SimpleRateThrottle):
    """Tighter, separately configurable rate limit for the public Climate
    Briefing Assistant endpoint (POST /api/climate/assistant/) — each
    AI-assisted request may call a paid external API, so this is throttled
    independently of the default anon/user rates.

    Scope is a fixed class attribute (not read from view.throttle_scope)
    because function-based @api_view views in the installed DRF version do
    not forward throttle_scope onto the generated APIView — only
    renderer/parser/authentication/throttle/permission *classes* are copied
    (see rest_framework.decorators.api_view). Overriding get_rate() avoids
    needing a matching DEFAULT_THROTTLE_RATES["climate_assistant"] entry.
    """

    scope = "climate_assistant"

    def get_rate(self):
        return getattr(settings, "CLIMATE_AI_THROTTLE_RATE", "20/hour")

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}
