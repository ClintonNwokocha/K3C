import os
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

# ---------------------------------------------------------------------------
# Server-side LULC tile cache
# Cache the GEE map ID (embedded in the upstream URL template) to avoid
# calling getMapId() on every tile request.  The upstream template is
# NEVER sent to the browser — it is only used within the Django process.
# ---------------------------------------------------------------------------
_lulc_map_cache: Dict[str, Any] = {}
_LULC_CACHE_TTL_S: int = 1800  # 30 min; GEE map IDs stay valid for ~4 h

# Server-side elevation tile cache (SRTM is static — same visualization every time).
_elevation_tile_cache: Dict[str, Any] = {}
_ELEVATION_CACHE_TTL_S: int = 1800  # 30 min


@dataclass
class GEEResult:
    available: bool
    data: Optional[Dict[str, Any]] = None
    error: str = ""


# ---------------------------------------------------------------------------
# Kaduna State boundary geometry
# ---------------------------------------------------------------------------
# Single MultiPolygon ring, 323 coordinate pairs.
# Source: kaduna_boundary.geojson (eHA Polio dataset, 2019-08-09).
# Used to clip/mask GEE raster tile previews to Kaduna State only.
# ---------------------------------------------------------------------------
_KADUNA_GEOMETRY_DICT: Dict[str, Any] = {
    "type": "MultiPolygon",
    "coordinates": [[[[7.87250140781379,9.289969744707999],[7.80838730113311,9.272846277933411],[7.79292964858445,9.275596618789001],[7.76385784126643,9.29585838315791],[7.73118892472917,9.326137384632659],[7.6929700247469,9.349402783012071],[7.67072320301344,9.38392276512354],[7.66749075809207,9.40136905793571],[7.64695523019975,9.408684983425299],[7.61406035630046,9.40605877059585],[7.54209411325274,9.387351140842499],[7.5091009884199,9.355031274573721],[7.38969069337082,9.335894030585109],[7.33397856495884,9.340772251937951],[7.27370298600403,9.3293270883745],[7.23225743992896,9.31771887502612],[7.22236416537396,9.33232913418226],[7.22141344617364,9.375293091103339],[7.20089664576363,9.459821223670589],[7.21898227741025,9.492680104003631],[7.25137295090099,9.52103349599906],[7.233942260427,9.564821187847601],[7.25887177061577,9.58909519298879],[7.29613995229698,9.613467633424589],[7.305647140703,9.62771532280397],[7.27636499904554,9.68994817366934],[7.25601961391408,9.712626559368291],[7.20474004691567,9.758296013350391],[7.21050405461847,9.780071259381151],[7.25171995161452,9.79437065078497],[7.27358961117164,9.7834358219057],[7.28536558225585,9.789323807447831],[7.29293584771125,9.81119346700495],[7.2887301447804,9.8406333929168],[7.29650020631954,9.8698482508961],[7.29377698901686,9.907925605682181],[7.28536558225585,9.933159827763919],[7.27779531500181,10.016432762162299],[7.25406694383446,10.0392265326784],[7.21601581597719,10.0374078750734],[7.17938184699472,10.0273675919408],[7.13816595089799,10.0357789987019],[7.10536146156227,10.026526450635201],[7.06498670587183,10.042508124650301],[6.95227336892088,10.0475549697861],[6.91442203534871,10.0778360370036],[6.90117883743346,10.0763816830683],[6.88208818372277,10.1171112069167],[6.88530111425507,10.150844575416899],[6.92144441582718,10.191003798686401],[6.94232702267402,10.180562973702299],[6.95447254317338,10.1919984830436],[6.9704389565926,10.232769965661401],[7.00979471205636,10.2504396437746],[7.01943302161669,10.273732184592699],[7.04593849206782,10.291402816886499],[7.05075740762828,10.3171043401932],[7.03389072427757,10.343609809745001],[7.02023649212049,10.354051589809],[6.97721385983181,10.364830016691901],[6.9342951765812,10.3612794878582],[6.92305088019401,10.382163048885699],[6.93831110007727,10.4335670469817],[6.95437478956495,10.462481499021999],[6.95351982118285,10.4821786878962],[6.93590164184735,10.500231743400301],[6.91260910012994,10.5379810326986],[6.86910247789706,10.5553569787416],[6.84433841688445,10.528343200678201],[6.83550310118721,10.5379810326986],[6.84192895865459,10.5725183492425],[6.82947921819141,10.5998268126573],[6.82947921819141,10.6247253421009],[6.80297422258235,10.643198967358501],[6.78530406962716,10.639183043862401],[6.75989914902658,10.645277941823601],[6.71978015513008,10.6435033303145],[6.71416119997946,10.6341153857165],[6.73132591775692,10.596402150239101],[6.70984554323729,10.5875358582933],[6.64706993083269,10.5934295653223],[6.58691692407683,10.5741243360693],[6.57406568488352,10.5572576527185],[6.54033184064195,10.545209884928299],[6.52159309434586,10.572834969058601],[6.52426815025495,10.5950069429161],[6.49454360780129,10.6156928419512],[6.45989710636644,10.5941879231342],[6.43558246985515,10.5908236555873],[6.42442340581556,10.577085856627001],[6.40242614774854,10.574422335422501],[6.38294645181736,10.540433602628701],[6.35533256604515,10.511202500195299],[6.32708856668404,10.495207666400701],[6.31542391638067,10.480156502021],[6.32163017829015,10.443505847916599],[6.28536035289801,10.4141876137674],[6.25445398706188,10.4274483061944],[6.23565112539916,10.384797583141999],[6.21671325031627,10.3893816371529],[6.20926199124796,10.374886760115899],[6.17309901970407,10.380901046446199],[6.16138598677389,10.417576424712299],[6.17489622218295,10.442200313793499],[6.15833177579088,10.5008316631508],[6.09224300610987,10.5217838388531],[6.09364019373999,10.5461970914227],[6.12445574063997,10.5541869949339],[6.13400521696724,10.590127533558899],[6.11480069469633,10.605303850292501],[6.13082030841053,10.6459743444405],[6.13723062109631,10.679239456635701],[6.09889763491799,10.701660689289399],[6.11650494864449,10.742855376674401],[6.10389366116357,10.7695121625563],[6.11378747711041,10.8143738023092],[6.13635516705739,10.8253244448673],[6.12259963976163,10.8448654781594],[6.16280535618228,10.8561428390208],[6.15783258280749,10.885116521310501],[6.16460702469448,10.893103743043399],[6.20922894116273,10.901772748913301],[6.23102927108403,10.918600339634001],[6.23748349856464,10.945327279830201],[6.25102061381034,10.9483105082234],[6.26717714031281,10.966682410265101],[6.27863968057687,10.9634524942373],[6.30416757897063,11.0030679918943],[6.33703472587194,11.021489178582801],[6.36480465571032,11.0176634329212],[6.3916111139618,11.033845811335199],[6.41898314595545,11.0277415874044],[6.43700600582258,11.0076095952067],[6.51076929666579,11.043658428393799],[6.5333741771766,11.047941457732099],[6.55157705433766,11.0417548585999],[6.57728936591155,11.0215674483791],[6.60545416287937,11.0464861226365],[6.65653178711233,11.0519876452137],[6.68741851984885,11.091662970269899],[6.70701496127151,11.094253416162299],[6.71599999790163,11.106221807090799],[6.69087542925769,11.1208906822592],[6.68498395434608,11.151544340399001],[6.68907662688486,11.203616464628199],[6.70335339314465,11.2390228437293],[6.73047924921804,11.258153710625299],[6.76677354786102,11.2721623116414],[6.77064321821001,11.3201185869033],[6.787132883276,11.319833053052999],[6.8294863731976,11.307184244957],[6.83985700879396,11.318864524578199],[6.83288240120191,11.3519679917295],[6.84454175989435,11.360355591637299],[6.87917450889654,11.3673189550058],[6.88783793537249,11.3823481777263],[6.91928806009594,11.384913448896601],[6.96131215173449,11.3587627708852],[7.00619316108555,11.3617897027327],[7.01362848056999,11.349229694594801],[7.00869989358529,11.293840408408199],[6.97825384124184,11.2636699676949],[6.96773385972989,11.2451696397671],[7.02545017498562,11.2095588339731],[7.07665540672167,11.1953051856858],[7.09575385035993,11.169523254894299],[7.11867883915716,11.1560862926484],[7.12929246167784,11.138164558847301],[7.16155418227976,11.130866607208199],[7.20102474879315,11.153385120427],[7.20007402959283,11.1731590133778],[7.21136888316749,11.2024396216912],[7.19478590804329,11.2575612066844],[7.20995729919008,11.2611072344114],[7.22739825542521,11.2786349401504],[7.29756970977434,11.273647057265901],[7.32019681882815,11.2650690825722],[7.35778190810862,11.264257115273701],[7.37011003505012,11.3332004554367],[7.39231300404197,11.3748302456194],[7.47250399596271,11.3760157526249],[7.49635852222809,11.3515690722549],[7.52029524742778,11.3616008460023],[7.52172519736001,11.340404114958],[7.55092843519918,11.3313966789137],[7.57756133868486,11.315480521409],[7.60750208175574,11.271802082799899],[7.61866756155877,11.277690311159001],[7.66883003837563,11.2969097298002],[7.67604135382544,11.3065378185655],[7.70617606267518,11.3100415601699],[7.72107750612207,11.324947028982301],[7.71326700207055,11.3483916100848],[7.72099480716469,11.370172679225799],[7.74158681877674,11.368297199756],[7.76480423472771,11.3792833115756],[7.78899654455495,11.359880111977599],[7.80551980739324,11.3716957008959],[7.82680442288586,11.3695988029424],[7.87891825227558,11.386228914233101],[7.90005941870726,11.4313062060166],[7.91698417487981,11.435576158313101],[7.94223764605056,11.4629477946051],[7.95648530755096,11.467413642625599],[7.96842311343596,11.478677663843101],[8.00090000043474,11.4921000004147],[8.0408363051514,11.4869435881761],[8.0819157597046,11.5055135317241],[8.08659329734286,11.517386711427701],[8.15008142012147,11.5191704375657],[8.16178865332375,11.5055374752743],[8.153881293187171,11.477422974690599],[8.140389536148231,11.456754362423901],[8.143324521309641,11.4202675746889],[8.11372187026814,11.408484264237501],[8.12291375726414,11.386672797111901],[8.14993198787101,11.3753931133016],[8.167448604069881,11.3543435104447],[8.206780772115,11.318701683436],[8.248775529667,11.325722682555799],[8.255680972199171,11.315035737409399],[8.257274956673941,11.279668045344099],[8.286115695782771,11.2682405435663],[8.297907885240759,11.2342239389836],[8.325179102333779,11.227182161927299],[8.33617214342974,11.2332795024471],[8.359306821752449,11.226579517231],[8.433814344756231,11.2265834023022],[8.46187243806264,11.171766610141001],[8.483406220620621,11.161623281789],[8.509004328187251,11.1586151934365],[8.506047334816691,11.1322356163806],[8.51963207725862,11.114907427036201],[8.59463929057085,11.0825156302922],[8.607312127652619,11.0712412183076],[8.614759426106669,11.017739975119801],[8.598995209961,11.0020599373163],[8.5812797545571,10.9420499803224],[8.571494101871339,10.9219102863307],[8.58374100564293,10.887981662423799],[8.585043322891069,10.8614875558061],[8.56305436916386,10.8164514340864],[8.562844576216261,10.7783147618168],[8.572947187762569,10.7736535963364],[8.57163702662751,10.748272388160199],[8.5393789941453,10.7334427591761],[8.501429727999611,10.7257839779483],[8.48123426075256,10.7158618963095],[8.50633035236393,10.6504570826283],[8.543728701018781,10.6317787959547],[8.59364653975604,10.645065435621399],[8.6495617000125,10.6240655086164],[8.666434260432821,10.593302762712399],[8.711128244972601,10.5433585117859],[8.74972743227522,10.5650420377599],[8.760375485340431,10.5818644079162],[8.78317676789356,10.5969687051417],[8.793080213780909,10.5654626084127],[8.773050030234741,10.504462112036901],[8.77674933481399,10.4794686042927],[8.75284608687747,10.4545579807663],[8.749219530257159,10.4406980008121],[8.782257012351289,10.424160140178399],[8.793015741383391,10.404235061299101],[8.81831842885248,10.3804462475963],[8.805094778601189,10.355613826417001],[8.799274878932581,10.302921225734099],[8.76342326886879,10.281369116791399],[8.73427706603383,10.275103278393701],[8.728683999666879,10.248280402118899],[8.686072779335349,10.2112304121538],[8.67203065968727,10.1462234594451],[8.67226833971216,10.0817368463784],[8.679643830898099,10.011051521210801],[8.63469241092605,9.866834108307501],[8.64394792315818,9.834731826712471],[8.64394792315818,9.77536012217195],[8.63360885466494,9.754630222007171],[8.598860068837149,9.727923997694401],[8.59902645420755,9.67872672815605],[8.581622627382391,9.67581846814784],[8.56561637489585,9.62431496006741],[8.565863609318169,9.596553802216251],[8.55567634188969,9.581567808107931],[8.556285858305779,9.55365753276897],[8.57775093985401,9.49924086787178],[8.602659774628931,9.48254971239936],[8.617661476296121,9.43476104738448],[8.64837455714013,9.395584105921779],[8.66952514576889,9.396523475677901],[8.695412636284169,9.378367424417149],[8.690713881840219,9.35499286812643],[8.69415092522507,9.32232761362849],[8.6578073500292,9.207689285931851],[8.649804974719871,9.173118754726771],[8.62071514139069,9.11488437691253],[8.593631555252101,9.090566538814761],[8.56402301814779,9.052246093682299],[8.564012388161251,9.03267914912351],[8.53326129926961,9.00437736472367],[8.50434589394791,9.00143146538989],[8.49065780591309,9.037734984781761],[8.476561546178459,9.05535411829794],[8.473918915325729,9.07297325091486],[8.44660854265015,9.11261749270318],[8.39551258124067,9.16195106528949],[8.387311935097779,9.175717353872811],[8.34563750166939,9.193908173823219],[8.328263858790081,9.181125614955191],[8.300863142020431,9.18850805430333],[8.25840775441441,9.18289193831237],[8.25350201110899,9.14724483588054],[8.232776338657169,9.10481629483621],[8.191895424734129,9.052430753276671],[8.13757126320326,9.03615377068002],[8.09906714683143,9.039674703724639],[8.061646934758301,9.052055201786169],[8.07079760402627,9.15464819166078],[8.087242992769969,9.2307390655555],[8.060933895582879,9.26576207805749],[7.94057187589141,9.31417523589846],[7.91908663424084,9.317365551179311],[7.87250140781379,9.289969744707999]]]]
}

# Bounding box derived from _KADUNA_GEOMETRY_DICT at import time (lng, lat pairs).
_k_coords = _KADUNA_GEOMETRY_DICT["coordinates"][0][0]
_KADUNA_BBOX = {
    "lat_min": min(c[1] for c in _k_coords),
    "lat_max": max(c[1] for c in _k_coords),
    "lng_min": min(c[0] for c in _k_coords),
    "lng_max": max(c[0] for c in _k_coords),
}
del _k_coords


def select_landsat_sensor(start_date: str, end_date: str):
    """
    Full-window source-availability check for the Landsat C2 L2 archive.

    Both dates are ISO strings. start_date is inclusive; end_date is exclusive
    (caller adds timedelta(days=1) to the inclusive season end before passing
    it here â€" consistent with the GEE filterDate convention).

    Selection rule (first match wins):
      1. LT05 â€" entire window within 1984-03-16 to 2012-05-05 incl.
                 (exclusive end_date <= "2012-05-06")
      2. LC08 â€" start_date >= "2013-03-18"
      3. LE07 â€" all remaining windows (bridge period)

    Returns (sensor_id, collection_id, red_band, nir_band).
    """
    if start_date >= "1984-03-16" and end_date <= "2012-05-06":
        return "LT05", "LANDSAT/LT05/C02/T1_L2", "SR_B3", "SR_B4"
    if start_date >= "2013-03-18":
        return "LC08", "LANDSAT/LC08/C02/T1_L2", "SR_B4", "SR_B5"
    return "LE07", "LANDSAT/LE07/C02/T1_L2", "SR_B3", "SR_B4"


class GoogleEarthEngineService:
    _DEFAULT_PROJECT = "kccc-499913"

    def __init__(self):
        self.project = os.getenv("GEE_PROJECT", self._DEFAULT_PROJECT)
        self.service_account = os.getenv("GEE_SERVICE_ACCOUNT", "")
        self.private_key_file = os.getenv("GEE_PRIVATE_KEY_FILE", "")

    def initialize(self) -> GEEResult:
        try:
            import ee
        except ImportError:
            return GEEResult(available=False, error="earthengine-api is not installed.")

        try:
            if self.service_account and self.private_key_file:
                credentials = ee.ServiceAccountCredentials(
                    self.service_account, self.private_key_file
                )
                ee.Initialize(credentials, project=self.project)
                auth_mode = "service_account"
            else:
                ee.Initialize(project=self.project)
                auth_mode = "application_default"

            return GEEResult(
                available=True,
                data={"initialized": True, "project": self.project, "auth_mode": auth_mode},
            )
        except Exception as exc:
            return GEEResult(available=False, error=str(exc))

    def compute_ndvi_for_geometry(
        self,
        geometry_dict: dict,
        start_date: str,
        end_date: str,
        scale: int = 60,
    ) -> GEEResult:
        """
        Compute median Sentinel-2 NDVI statistics for a single GeoJSON geometry.

        start_date / end_date: 'YYYY-MM-DD' strings.
        end_date is exclusive (GEE filterDate convention) â€" the caller adds one day
        to the intended inclusive end before passing it here.

        Returns GEEResult with data = {"mean": float|None, "min": float|None, "max": float|None}.

        scale=60 is the production default (Sentinel-2 60 m bands / fast server-side
        aggregation). Use scale=10 only for high-resolution exports; scale=100 for
        quick smoke tests.
        """
        try:
            import ee
        except ImportError:
            return GEEResult(available=False, error="earthengine-api is not installed.")

        try:
            geometry = ee.Geometry(geometry_dict)

            def mask_s2_clouds(image):
                scl = image.select("SCL")
                # Mask: cloud shadow (3), cloud med prob (8),
                #       cloud high prob (9), thin cirrus (10).
                return image.updateMask(
                    scl.neq(3).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10))
                )

            def add_ndvi(image):
                return image.addBands(
                    image.normalizedDifference(["B8", "B4"]).rename("NDVI")
                )

            composite = (
                ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                .filterDate(start_date, end_date)
                .filterBounds(geometry)
                .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 30))
                .map(mask_s2_clouds)
                .map(add_ndvi)
                .select("NDVI")
                .median()
            )

            # Combined reducer yields NDVI_mean, NDVI_min, NDVI_max.
            reducer = ee.Reducer.mean().combine(
                reducer2=ee.Reducer.minMax(),
                sharedInputs=True,
            )
            result = composite.reduceRegion(
                reducer=reducer,
                geometry=geometry,
                scale=scale,
                maxPixels=1e9,
            )

            props = result.getInfo()
            return GEEResult(
                available=True,
                data={
                    "mean": props.get("NDVI_mean"),
                    "min":  props.get("NDVI_min"),
                    "max":  props.get("NDVI_max"),
                },
            )

        except Exception as exc:
            return GEEResult(available=False, error=str(exc))

    def compute_landsat_ndvi_for_geometry(
        self,
        geometry_dict: dict,
        start_date: str,
        end_date: str,
        scale: int = 30,
    ) -> GEEResult:
        """
        Compute median Landsat C2 L2 NDVI statistics for a single GeoJSON geometry.

        Selection policy: primary_window_sensor_with_archive_fallback.
          Stage 1 â€" date-window primary: LT05 if window fully within LT05 range,
            LC08 if start_date >= 2013-03-18, LE07 for all bridge periods.
          Stage 2 â€" archive fallback: if the primary sensor has zero scenes over
            this geometry/window, use the best available alternative with scenes.

        Always one sensor per task; never a multi-sensor composite.

        start_date is inclusive; end_date is exclusive (GEE filterDate convention).
        """
        try:
            import ee
        except ImportError:
            return GEEResult(available=False, error="earthengine-api is not installed.")

        try:
            # Stage 1: primary sensor by date-window eligibility (Python-only).
            sensor, _, _, _ = select_landsat_sensor(start_date, end_date)

            geometry = ee.Geometry(geometry_dict)

            # All three candidate collections for scene-count evaluation.
            l5_col = (
                ee.ImageCollection("LANDSAT/LT05/C02/T1_L2")
                .filterDate(start_date, end_date)
                .filterBounds(geometry)
            )
            l7_col = (
                ee.ImageCollection("LANDSAT/LE07/C02/T1_L2")
                .filterDate(start_date, end_date)
                .filterBounds(geometry)
            )
            l8_col = (
                ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
                .filterDate(start_date, end_date)
                .filterBounds(geometry)
            )

            l5_size = l5_col.size()
            l7_size = l7_col.size()
            l8_size = l8_col.size()

            # Sensor-parameterised QA and NDVI factory functions.
            def _make_mask_qa(s):
                def mask_qa(image):
                    qa = image.select("QA_PIXEL")
                    common_clear = (
                        qa.bitwiseAnd(1 << 0).eq(0)        # fill
                        .And(qa.bitwiseAnd(1 << 1).eq(0))  # dilated cloud
                        .And(qa.bitwiseAnd(1 << 3).eq(0))  # cloud
                        .And(qa.bitwiseAnd(1 << 4).eq(0))  # cloud shadow
                        .And(qa.bitwiseAnd(1 << 5).eq(0))  # snow
                    )
                    pixel_clear = (
                        common_clear.And(qa.bitwiseAnd(1 << 2).eq(0))  # cirrus
                        if s == "LC08" else common_clear
                    )
                    radsat = image.select("QA_RADSAT")
                    if s == "LC08":
                        not_sat = (
                            radsat.bitwiseAnd(1 << 3).eq(0)
                            .And(radsat.bitwiseAnd(1 << 4).eq(0))
                        )
                    elif s == "LE07":
                        not_sat = (
                            radsat.bitwiseAnd(1 << 2).eq(0)
                            .And(radsat.bitwiseAnd(1 << 3).eq(0))
                            .And(radsat.bitwiseAnd(1 << 9).eq(0))
                        )
                    else:  # LT05
                        not_sat = (
                            radsat.bitwiseAnd(1 << 2).eq(0)
                            .And(radsat.bitwiseAnd(1 << 3).eq(0))
                        )
                    return image.updateMask(pixel_clear.And(not_sat))
                return mask_qa

            def _make_compute_ndvi(r, n):
                def compute_ndvi(image):
                    red = image.select(r).multiply(0.0000275).add(-0.2)
                    nir = image.select(n).multiply(0.0000275).add(-0.2)
                    denom = nir.add(red)
                    ndvi = (
                        nir.subtract(red)
                        .divide(denom)
                        .updateMask(denom.neq(0))
                        .rename("NDVI")
                    )
                    return image.addBands(ndvi)
                return compute_ndvi

            processed_l5 = (
                l5_col
                .map(_make_mask_qa("LT05"))
                .map(_make_compute_ndvi("SR_B3", "SR_B4"))
                .select("NDVI")
            )
            processed_l7 = (
                l7_col
                .map(_make_mask_qa("LE07"))
                .map(_make_compute_ndvi("SR_B3", "SR_B4"))
                .select("NDVI")
            )
            processed_l8 = (
                l8_col
                .map(_make_mask_qa("LC08"))
                .map(_make_compute_ndvi("SR_B4", "SR_B5"))
                .select("NDVI")
            )

            # Stage 2: server-side fallback selection via ee.Algorithms.If.
            # Python branches on the primary sensor string (not a server-side value),
            # so no extra getInfo() is needed.  Each branch is lazy on the GEE server.
            if sensor == "LT05":
                actual_processed = ee.ImageCollection(ee.Algorithms.If(
                    l5_size.gt(0), processed_l5,
                    ee.Algorithms.If(l7_size.gt(0), processed_l7, processed_l5),
                ))
                actual_sensor_ee = ee.Algorithms.If(
                    l5_size.gt(0), "LT05",
                    ee.Algorithms.If(l7_size.gt(0), "LE07", "LT05"),
                )
                selection_reason_ee = ee.Algorithms.If(
                    l5_size.gt(0), "primary_window_sensor",
                    ee.Algorithms.If(l7_size.gt(0), "archive_fallback_no_primary_scene",
                                     "no_candidate_scene"),
                )
            elif sensor == "LC08":
                actual_processed = ee.ImageCollection(ee.Algorithms.If(
                    l8_size.gt(0), processed_l8,
                    ee.Algorithms.If(l7_size.gt(0), processed_l7, processed_l8),
                ))
                actual_sensor_ee = ee.Algorithms.If(
                    l8_size.gt(0), "LC08",
                    ee.Algorithms.If(l7_size.gt(0), "LE07", "LC08"),
                )
                selection_reason_ee = ee.Algorithms.If(
                    l8_size.gt(0), "primary_window_sensor",
                    ee.Algorithms.If(l7_size.gt(0), "archive_fallback_no_primary_scene",
                                     "no_candidate_scene"),
                )
            else:  # LE07 primary (bridge period)
                actual_processed = ee.ImageCollection(ee.Algorithms.If(
                    l7_size.gt(0), processed_l7,
                    ee.Algorithms.If(l5_size.gt(0), processed_l5,
                    ee.Algorithms.If(l8_size.gt(0), processed_l8, processed_l7)),
                ))
                actual_sensor_ee = ee.Algorithms.If(
                    l7_size.gt(0), "LE07",
                    ee.Algorithms.If(l5_size.gt(0), "LT05",
                    ee.Algorithms.If(l8_size.gt(0), "LC08", "LE07")),
                )
                selection_reason_ee = ee.Algorithms.If(
                    l7_size.gt(0), "primary_window_sensor",
                    ee.Algorithms.If(
                        l5_size.gt(0).Or(l8_size.gt(0)),
                        "archive_fallback_no_primary_scene",
                        "no_candidate_scene",
                    ),
                )

            # Zero-band guard: actual_processed.count() returns a zero-band image
            # when the collection is empty; unmask(0) then fails ("Got 0 and 1 bands").
            # Server-side If avoids calling unmask on the zero-band path.
            collection_size = actual_processed.size()

            zero_count = ee.Image.constant(0).rename("obs_count").clip(geometry)
            no_data_ndvi = (
                ee.Image.constant(0)
                .rename("NDVI")
                .updateMask(ee.Image.constant(0))
                .clip(geometry)
            )

            obs_count = ee.Image(ee.Algorithms.If(
                collection_size.gt(0),
                actual_processed.count().rename("obs_count").unmask(0),
                zero_count,
            ))
            composite = ee.Image(ee.Algorithms.If(
                collection_size.gt(0),
                actual_processed.median().rename("NDVI"),
                no_data_ndvi,
            ))
            has_obs = obs_count.gt(0).toFloat()

            stats_img = (
                composite
                .addBands(obs_count.toFloat().rename("obs_count"))
                .addBands(has_obs.rename("has_obs"))
            )

            combined_reducer = ee.Reducer.mean().combine(
                reducer2=ee.Reducer.minMax(),
                sharedInputs=True,
            )
            stats_result = stats_img.reduceRegion(
                reducer=combined_reducer,
                geometry=geometry,
                scale=scale,
                maxPixels=1e9,
            )

            # Single getInfo() round-trip â€" scene counts, actual sensor label, and
            # selection reason all resolved server-side before the client call.
            all_stats = stats_result.combine(ee.Dictionary({
                "l5_count":         l5_size,
                "l7_count":         l7_size,
                "l8_count":         l8_size,
                "source_count":     collection_size,
                "actual_sensor":    actual_sensor_ee,
                "selection_reason": selection_reason_ee,
            }))

            props = all_stats.getInfo()

            # Derive Python-side values from the resolved actual_sensor string.
            actual_sensor    = props.get("actual_sensor", sensor)
            selection_reason = props.get("selection_reason", "primary_window_sensor")

            _SENSOR_BANDS = {
                "LT05": ("SR_B3", "SR_B4"),
                "LE07": ("SR_B3", "SR_B4"),
                "LC08": ("SR_B4", "SR_B5"),
            }
            actual_red, actual_nir = _SENSOR_BANDS.get(actual_sensor, ("SR_B3", "SR_B4"))
            slc_off_flag = (actual_sensor == "LE07") and (end_date > "2003-05-31")

            ndvi_mean = props.get("NDVI_mean")
            ndvi_min  = props.get("NDVI_min")
            ndvi_max  = props.get("NDVI_max")
            obs_mean  = props.get("obs_count_mean") or 0.0
            cov_frac  = props.get("has_obs_mean") or 0.0
            cov_pct   = round(cov_frac * 100, 2)

            if cov_pct >= 80:
                coverage_status = "good"
            elif cov_pct >= 50:
                coverage_status = "limited"
            elif cov_pct > 0:
                coverage_status = "very_limited"
            else:
                coverage_status = "no_data"

            dynamic_meta = {
                "selected_sensor":                   actual_sensor,
                "selected_red_band":                 actual_red,
                "selected_nir_band":                 actual_nir,
                "candidate_sensor_scene_counts": {
                    "LT05": props.get("l5_count", 0),
                    "LE07": props.get("l7_count", 0),
                    "LC08": props.get("l8_count", 0),
                },
                "source_image_count":                props.get("source_count", 0),
                "sensor_composite_type":             "single_sensor",
                "slc_off_flag":                      slc_off_flag,
                "mean_valid_observations_per_pixel": round(obs_mean, 4),
                "valid_pixel_coverage_pct":          cov_pct,
                "coverage_status":                   coverage_status,
                "selection_reason":                  selection_reason,
            }

            return GEEResult(
                available=True,
                data={
                    "mean": ndvi_mean,
                    "min":  ndvi_min,
                    "max":  ndvi_max,
                    "metadata": dynamic_meta,
                },
            )

        except Exception as exc:
            return GEEResult(available=False, error=str(exc))

    def compute_rainfall_for_geometry(
        self,
        geometry_dict: dict,
        start_date: str,
        end_date: str,
        scale: int = 5566,
    ) -> GEEResult:
        """
        Compute accumulated CHIRPS rainfall for a single GeoJSON geometry.

        Metric definition
        -----------------
        1. Filter CHIRPS Daily (UCSB-CHG/CHIRPS/DAILY) by date window and
           geometry bounds.
        2. Select the 'precipitation' band (daily mm/day values).
        3. Sum all daily images â†’ single accumulated-rainfall image (mm for the
           full period).
        4. Apply reduceRegion(mean) over the LGA geometry â†’ spatial mean of the
           accumulated rainfall raster.

        The returned value:
            mean  = spatial mean of accumulated rainfall for the period  (mm)

        start_date / end_date: 'YYYY-MM-DD' strings.
        end_date is exclusive (GEE filterDate convention) â€" the caller adds one
        day to the intended inclusive end before passing it here.

        scale=5566 matches CHIRPS native 0.05Â° pixel resolution (~5.5 km).
        Use scale=5000 for quick smoke tests.
        """
        try:
            import ee
        except ImportError:
            return GEEResult(available=False, error="earthengine-api is not installed.")

        try:
            geometry = ee.Geometry(geometry_dict)

            accumulated = (
                ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
                .filterDate(start_date, end_date)
                .filterBounds(geometry)
                .select("precipitation")
                .sum()
            )

            result = accumulated.reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=geometry,
                scale=scale,
                maxPixels=1e9,
            )

            props = result.getInfo()
            # After .sum() the band name remains 'precipitation'.
            mean_accumulated_mm = props.get("precipitation")

            return GEEResult(
                available=True,
                data={"mean": mean_accumulated_mm},
            )

        except Exception as exc:
            return GEEResult(available=False, error=str(exc))

    def compute_lst_for_geometry(
        self,
        geometry_dict: dict,
        start_date: str,
        end_date: str,
        scale: int = 1000,
    ) -> GEEResult:
        """
        Compute daytime LST statistics from MODIS/061/MOD11A1 (Terra, daily 1 km).

        Processing path:
        1. Filter MOD11A1 to the geometry and date window; preserve raw image count
           before any per-pixel masking.
        2. Apply QC mask per image:
             mandatory_ok    = QC_Day bits 0-1 <= 1
             data_quality_ok = QC_Day bits 2-3 <= 1
             lst_error_ok    = QC_Day bits 6-7 <= 1
        3. Convert DN to Celsius: LST_Day_1km * 0.02 - 273.15.
        4. Build temporal mean composite over quality-filtered daily images.
        5. Compute spatial mean, min, max, mean valid obs per pixel, and valid
           pixel coverage % over the LGA geometry.
        6. Zero-band guard (ee.Algorithms.If) prevents unmask() on empty
           collections; returns available=True with mean=None on no-data.

        start_date / end_date: 'YYYY-MM-DD' strings; end_date is exclusive
        (GEE filterDate convention).

        scale=1000 m matches the MOD11A1 native 1 km pixel resolution.
        """
        try:
            import ee
        except ImportError:
            return GEEResult(available=False, error="earthengine-api is not installed.")

        try:
            geometry = ee.Geometry(geometry_dict)

            # Raw collection before per-pixel QC â€" image count preserved for metadata.
            raw_collection = (
                ee.ImageCollection("MODIS/061/MOD11A1")
                .filterDate(start_date, end_date)
                .filterBounds(geometry)
            )
            source_count = raw_collection.size()

            def apply_qc_and_convert(image):
                qc = image.select("QC_Day")
                mandatory_ok    = qc.bitwiseAnd(3).lte(1)
                data_quality_ok = qc.rightShift(2).bitwiseAnd(3).lte(1)
                lst_error_ok    = qc.rightShift(6).bitwiseAnd(3).lte(1)
                mask = mandatory_ok.And(data_quality_ok).And(lst_error_ok)
                lst_celsius = (
                    image.select("LST_Day_1km")
                    .multiply(0.02)
                    .subtract(273.15)
                    .rename("LST_C")
                )
                return lst_celsius.updateMask(mask)

            masked_collection = raw_collection.map(apply_qc_and_convert)

            # Zero-band guard: count() on a completely empty collection (source_count=0)
            # returns a zero-band image; unmask(0) on that raises a server-side error.
            # Use ee.Algorithms.If to avoid the empty path.
            zero_obs = ee.Image.constant(0).rename("obs_count").clip(geometry)
            no_data_img = (
                ee.Image.constant(0)
                .rename("LST_C")
                .updateMask(ee.Image.constant(0))
                .clip(geometry)
            )

            obs_count = ee.Image(ee.Algorithms.If(
                source_count.gt(0),
                masked_collection.count().rename("obs_count").unmask(0),
                zero_obs,
            ))
            composite = ee.Image(ee.Algorithms.If(
                source_count.gt(0),
                masked_collection.mean().rename("LST_C"),
                no_data_img,
            ))
            has_obs = obs_count.gt(0).toFloat()

            stats_img = (
                composite
                .addBands(obs_count.toFloat().rename("obs_count"))
                .addBands(has_obs.rename("has_obs"))
            )

            combined_reducer = ee.Reducer.mean().combine(
                reducer2=ee.Reducer.minMax(),
                sharedInputs=True,
            )
            stats_result = stats_img.reduceRegion(
                reducer=combined_reducer,
                geometry=geometry,
                scale=scale,
                maxPixels=1e9,
            )

            # Single getInfo() round-trip â€" all statistics and raw source count
            # resolved server-side before the client call.
            all_stats = stats_result.combine(ee.Dictionary({"source_count": source_count}))
            props = all_stats.getInfo()

            lst_mean = props.get("LST_C_mean")
            lst_min  = props.get("LST_C_min")
            lst_max  = props.get("LST_C_max")
            obs_mean = props.get("obs_count_mean") or 0.0
            cov_frac = props.get("has_obs_mean") or 0.0
            cov_pct  = round(cov_frac * 100, 2)

            if cov_pct >= 80:
                coverage_status = "good"
            elif cov_pct >= 50:
                coverage_status = "limited"
            elif cov_pct > 0:
                coverage_status = "very_limited"
            else:
                coverage_status = "no_data"

            dynamic_meta = {
                "source_image_count":                props.get("source_count", 0),
                "mean_valid_observations_per_pixel":  round(obs_mean, 4),
                "valid_pixel_coverage_pct":           cov_pct,
                "coverage_status":                    coverage_status,
                "temporal_aggregation":               "daily_quality_filtered_mean",
                "source_band":                        "LST_Day_1km",
                "quality_policy":                     "mandatory QA <=1; data quality <=1; LST error <=1",
                "temperature_unit":                   "celsius",
            }

            return GEEResult(
                available=True,
                data={
                    "mean": lst_mean,
                    "min":  lst_min,
                    "max":  lst_max,
                    "metadata": dynamic_meta,
                },
            )

        except Exception as exc:
            return GEEResult(available=False, error=str(exc))

    def compute_land_cover_for_geometry(
        self,
        geometry_dict: dict,
        start_date: str,
        end_date: str,
        scale: int = 10,
        cloud_filter_pct: int = 30,
        provider_key: str = "dynamic_world_v1",
        peak_months: tuple = (7, 8),
        method_version: str = "",
    ):
        """
        Compute Dynamic World v1 mode land-cover classification for a GeoJSON geometry.

        Method: per-pixel mode of the 'label' band across all DW images in the date
        window, then a frequency histogram reducer over the geometry.

        Dynamic World v1 does not carry a scene-level CLOUDY_PIXEL_PERCENTAGE property
        (unlike Sentinel-2 SR Harmonized).  Cloud masking in DW is applied at the
        pixel level by the DW algorithm itself â€" scenes are not pre-filtered by cloud
        cover.  The cloud_filter_pct parameter is accepted for API consistency but is
        not applied for the dynamic_world_v1 provider.

        start_date / end_date: 'YYYY-MM-DD' strings (end_date is exclusive, GEE convention).
        scale: GEE reduceRegion scale in metres; 10 m is the DW native resolution.
        peak_months: month numbers (1â€"12) counted for peak-season scene quality assessment.
            Defaults to (7, 8) for the wet_season window; use (9, 10) for late_wet_season.
        method_version: overrides provider.method_version when set; identifies the composite
            window method in stored metadata.

        Returns LandCoverComputeResult (not GEEResult â€" return type is distinct because
        land-cover data is a class distribution, not a single scalar).
        """
        from remote_sensing.lulc_providers import (
            LandCoverComputeResult, get_provider, compute_quality_flag,
        )

        def _fail(msg):
            return LandCoverComputeResult(
                success=False, class_pixel_counts={}, total_pixels=0,
                masked_pixels=0, error=msg,
            )

        try:
            provider = get_provider(provider_key)
        except ValueError as exc:
            return _fail(str(exc))

        code_to_key: Dict[int, str] = {
            cls_def.gee_class_code: cls_def.key
            for cls_def in provider.class_scheme.values()
        }

        try:
            import ee
        except ImportError:
            return _fail("earthengine-api is not installed.")

        try:
            geometry = ee.Geometry(geometry_dict)

            # Dynamic World does not have CLOUDY_PIXEL_PERCENTAGE; pixel-level
            # cloud masking is handled internally by the DW algorithm.
            # No scene-level pre-filter is applied.
            collection = (
                ee.ImageCollection(provider.gee_collection)
                .filterDate(start_date, end_date)
                .filterBounds(geometry)
                .select("label")
            )

            source_count = collection.size()

            # Empty-collection guard: mode() on an empty collection raises a
            # server-side error; return an all-masked image on that path.
            no_data_label = (
                ee.Image.constant(-1)
                .rename("label")
                .updateMask(ee.Image.constant(0))
                .clip(geometry)
            )
            label_mode = ee.Image(ee.Algorithms.If(
                source_count.gt(0),
                collection.mode(),
                no_data_label,
            ))

            # Unmask with -1 so masked pixels appear in the histogram as a
            # negative sentinel, allowing them to be counted separately.
            label_unmasked = label_mode.unmask(-1)

            histogram_result = label_unmasked.reduceRegion(
                reducer=ee.Reducer.frequencyHistogram(),
                geometry=geometry,
                scale=scale,
                maxPixels=1e9,
            )

            # Single getInfo() round-trip: histogram + source count + scene timestamps.
            # scene_timestamps_ms enables peak-season coverage diagnostics without
            # a second server call.
            all_info = histogram_result.combine(
                ee.Dictionary({
                    "source_image_count": source_count,
                    "scene_timestamps_ms": collection.aggregate_array("system:time_start"),
                })
            ).getInfo()

            histogram: dict = all_info.get("label", {})
            source_image_count = int(all_info.get("source_image_count", 0))

            # Compute peak-season coverage diagnostics from scene timestamps.
            # Keys are month strings to survive JSONB serialisation.
            # Only months seen in actual timestamps are recorded (window-agnostic).
            from datetime import datetime, timezone as _utc
            monthly_scene_counts: Dict[str, int] = {}
            for ts_ms in all_info.get("scene_timestamps_ms", []):
                month = datetime.fromtimestamp(int(ts_ms) / 1000, tz=_utc.utc).month
                m_str = str(month)
                monthly_scene_counts[m_str] = monthly_scene_counts.get(m_str, 0) + 1
            peak_season_scene_count = sum(
                monthly_scene_counts.get(str(m), 0) for m in peak_months
            )
            peak_season_scene_ratio = (
                round(peak_season_scene_count / source_image_count, 4)
                if source_image_count > 0 else 0.0
            )

            masked_pixels = 0
            class_pixel_counts: Dict[str, int] = {}

            for code_str, count in histogram.items():
                code = int(float(code_str))
                count = int(count)
                if code < 0:
                    masked_pixels += count
                    continue
                class_key = code_to_key.get(code)
                if class_key is not None:
                    class_pixel_counts[class_key] = (
                        class_pixel_counts.get(class_key, 0) + count
                    )

            # Ensure every provider class is present (defaulting absent classes to 0)
            # so all LandCoverSnapshot rows have a consistent JSON key set.
            for cls_def in provider.class_scheme.values():
                if cls_def.key not in class_pixel_counts:
                    class_pixel_counts[cls_def.key] = 0

            total_pixels = sum(class_pixel_counts.values())

            return LandCoverComputeResult(
                success=True,
                class_pixel_counts=class_pixel_counts,
                total_pixels=total_pixels,
                masked_pixels=masked_pixels,
                metadata={
                    "provider_key": provider_key,
                    "gee_collection": provider.gee_collection,
                    "source_image_count": source_image_count,
                    "monthly_scene_counts": monthly_scene_counts,
                    "peak_months": list(peak_months),
                    "peak_season_scene_count": peak_season_scene_count,
                    "peak_season_scene_ratio": peak_season_scene_ratio,
                    "quality_flag": compute_quality_flag(peak_season_scene_count),
                    "cloud_masking": "pixel_level_by_dw_algorithm",
                    "composite_method": "mode",
                    "composite_band": "label",
                    "scale_m": scale,
                    "method_version": method_version if method_version else provider.method_version,
                },
            )

        except Exception as exc:
            return _fail(str(exc))

    def status(self) -> GEEResult:
        return GEEResult(
            available=False,
            data={
                "initialized": False,
                "project": self.project,
                "auth_mode": "not_configured",
            },
            error="Google Earth Engine is not configured yet.",
        )

    def get_tile_url(self, layer_key: str, visualization=None) -> GEEResult:
        return GEEResult(
            available=False,
            data={
                "layer": layer_key,
                "tile_url": "",
                "attribution": "Google Earth Engine",
                "visualization": visualization or {},
            },
            error="Tile URL is not available yet. Configure Google Earth Engine later.",
        )

    def get_lulc_tile_url(
        self,
        year: int = 2024,
        start_date: str = "2024-09-01",
        end_date: str = "2024-11-01",
        display_mode: str = "cartographic",
    ) -> GEEResult:
        """
        Return a GEE XYZ tile URL for the Dynamic World v1 label-mode composite.

        Internal LULC preview only — not for public exposure.
        Requires GEE to be authenticated (application_default or service account).

        display_mode:
          "cartographic" — applies focal_mode(radius=1, units="pixels") to reduce
                           salt-and-pepper noise before visualisation.
          "raw"          — unfiltered mode composite for technical inspection.

        DW label class index: 0=water 1=trees 2=grass 3=flooded_vegetation 4=crops
                               5=shrub_scrub 6=built_area 7=bare_ground 8=snow_ice
        """
        try:
            import ee
        except ImportError:
            return GEEResult(available=False, error="earthengine-api is not installed.")

        generalization_method = "focal_mode_r1px" if display_mode == "cartographic" else None

        init_result = self.initialize()
        if not init_result.available:
            return GEEResult(
                available=False,
                error=f"GEE not initialised: {init_result.error}",
                data={
                    "tile_url": "",
                    "year": year,
                    "composite_window": "late_wet_season",
                    "start_date": start_date,
                    "end_date": end_date,
                    "method_version": "dw_latewet_mode_v1",
                    "display_mode": display_mode,
                    "generalization_method": generalization_method,
                },
            )

        try:
            # Clip composite to Kaduna State boundary so pixels outside are
            # masked (transparent in the tile).  filterBounds reduces the
            # collection to scenes that intersect Kaduna before mode().
            kaduna_geom = ee.Geometry(_KADUNA_GEOMETRY_DICT)

            label_mode = (
                ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
                .filterDate(start_date, end_date)
                .filterBounds(kaduna_geom)
                .select("label")
                .mode()
            )

            if display_mode == "cartographic":
                # Suppress salt-and-pepper noise with a 1-pixel focal mode kernel.
                label_mode = label_mode.focal_mode(radius=1, units="pixels")

            composite = label_mode.clip(kaduna_geom)

            # Official Dynamic World palette â€" class index 0 through 8.
            vis = {
                "min": 0,
                "max": 8,
                "palette": [
                    "#419BDF",  # 0  water
                    "#397D49",  # 1  trees
                    "#88B053",  # 2  grass
                    "#7A87C6",  # 3  flooded_vegetation
                    "#E49635",  # 4  crops
                    "#DFC35A",  # 5  shrub_scrub
                    "#C4281B",  # 6  built_area
                    "#A59B8F",  # 7  bare_ground
                    "#B39FE1",  # 8  snow_ice
                ],
            }

            map_id_dict = composite.getMapId(vis)
            tile_url = map_id_dict["tile_fetcher"].url_format

            return GEEResult(
                available=True,
                data={
                    "tile_url": tile_url,
                    "attribution": "Dynamic World v1 · Google / WRI · Google Earth Engine",
                    "year": year,
                    "composite_window": "late_wet_season",
                    "start_date": start_date,
                    "end_date": end_date,
                    "method_version": "dw_latewet_mode_v1",
                    "display_mode": display_mode,
                    "generalization_method": generalization_method,
                },
            )
        except Exception as exc:
            return GEEResult(
                available=False,
                error=str(exc),
                data={
                    "tile_url": "",
                    "year": year,
                    "composite_window": "late_wet_season",
                    "start_date": start_date,
                    "end_date": end_date,
                    "method_version": "dw_latewet_mode_v1",
                    "display_mode": display_mode,
                    "generalization_method": generalization_method,
                },
            )

    def get_elevation_tile_url(self) -> GEEResult:
        """
        Return a GEE XYZ tile URL for the USGS SRTMGL1_003 DEM clipped to Kaduna State.

        Internal elevation preview only — not for public exposure.
        Requires GEE to be authenticated.

        Visualization: terrain-green 5-stop palette calibrated to Kaduna's
        actual elevation range (~400–1000 m).  Same colour steps as the
        LGA-summary choropleth legend.
        """
        try:
            import ee
        except ImportError:
            return GEEResult(available=False, error="earthengine-api is not installed.")

        init_result = self.initialize()
        if not init_result.available:
            return GEEResult(
                available=False,
                error=f"GEE not initialised: {init_result.error}",
                data={
                    "tile_url": "",
                    "source": "USGS/SRTMGL1_003",
                    "method_version": "srtm_terrain_tile_v1",
                },
            )

        try:
            kaduna_geom = ee.Geometry(_KADUNA_GEOMETRY_DICT)
            dem = ee.Image("USGS/SRTMGL1_003").select("elevation").clip(kaduna_geom)

            vis = {
                "min": 400,
                "max": 1000,
                "palette": [
                    "#f7fcf5",  # <550 m  low plains
                    "#c7e9c0",  # ~650 m  lower plateau
                    "#74c476",  # ~750 m  central plateau
                    "#238b45",  # ~850 m  upland
                    "#00441b",  # ≥1000 m highland
                ],
            }

            map_id_dict = dem.getMapId(vis)
            tile_url = map_id_dict["tile_fetcher"].url_format

            return GEEResult(
                available=True,
                data={
                    "tile_url": tile_url,
                    "attribution": "USGS SRTMGL1 v003 · NASA SRTM · Google Earth Engine",
                    "source": "USGS/SRTMGL1_003",
                    "band": "elevation",
                    "vis_min_m": 400,
                    "vis_max_m": 1000,
                    "acquisition_year": 2000,
                    "source_resolution": "~30 m (1 arc-second SRTM)",
                    "method_version": "srtm_terrain_tile_v1",
                },
            )
        except Exception as exc:
            return GEEResult(
                available=False,
                error=str(exc),
                data={
                    "tile_url": "",
                    "source": "USGS/SRTMGL1_003",
                    "method_version": "srtm_terrain_tile_v1",
                },
            )

    def get_elevation_upstream_template(self) -> "GEEResult":
        """
        Return the GEE tile URL template for the SRTM elevation layer, using a
        server-side TTL cache.

        The upstream template (which contains an authenticated GEE map ID) is
        stored in process memory only.  It is never returned to the browser.
        Callers must treat this value as an internal secret.
        """
        cached = _elevation_tile_cache.get("srtm")
        if cached and cached["expires"] > time.monotonic():
            return GEEResult(available=True, data={"upstream_template": cached["template"]})

        result = self.get_elevation_tile_url()
        if not result.available:
            return result

        template = result.data.get("tile_url", "")
        _elevation_tile_cache["srtm"] = {
            "template": template,
            "expires": time.monotonic() + _ELEVATION_CACHE_TTL_S,
        }
        return GEEResult(available=True, data={"upstream_template": template})

    def fetch_elevation_tile_bytes(
        self,
        upstream_template: str,
        z: int,
        x: int,
        y: int,
    ) -> Optional[bytes]:
        """
        Fetch one SRTM PNG tile from the GEE upstream using server-side credentials.

        The upstream_template contains the authenticated GEE map ID.  It is
        used to build the specific tile URL internally; it is not logged and
        never appears in any response body.

        Returns raw PNG bytes on success, None on any failure.
        """
        tile_url = (
            upstream_template
            .replace("{z}", str(z))
            .replace("{x}", str(x))
            .replace("{y}", str(y))
        )
        try:
            import ee  # noqa: PLC0415
            from google.auth.transport.requests import AuthorizedSession  # noqa: PLC0415

            state = ee.data._get_state()
            creds = state.credentials
            if creds is None:
                init_result = self.initialize()
                if not init_result.available:
                    return None
                creds = ee.data._get_state().credentials
            session = AuthorizedSession(creds)
            resp = session.get(tile_url, timeout=30, allow_redirects=False)
            if resp.status_code == 200:
                return resp.content
            return None
        except Exception:  # noqa: BLE001
            return None

    def sample_elevation_at_point(self, lat: float, lng: float) -> GEEResult:
        """
        Sample USGS SRTMGL1_003 elevation at a single point within Kaduna State.

        Uses ee.Reducer.first() over a 30 m region to read the native SRTM
        cell value at the requested coordinates.  The SRTM image is clipped
        to the Kaduna State boundary before sampling; a null result (masked
        pixel) indicates the point is outside Kaduna State.

        Returns the sampled SRTM cell elevation in metres, not an interpolated
        or modelled value.  Not survey-grade; not real-time.
        """
        try:
            import ee
        except ImportError:
            return GEEResult(available=False, error="earthengine-api is not installed.")

        init_result = self.initialize()
        if not init_result.available:
            return GEEResult(available=False, error=f"GEE not initialised: {init_result.error}")

        try:
            point = ee.Geometry.Point([lng, lat])
            kaduna_geom = ee.Geometry(_KADUNA_GEOMETRY_DICT)

            dem = ee.Image("USGS/SRTMGL1_003").select("elevation").clip(kaduna_geom)

            result = dem.reduceRegion(
                reducer=ee.Reducer.first(),
                geometry=point,
                scale=30,
                maxPixels=1,
            )
            props = result.getInfo()
            elevation_m = props.get("elevation")

            if elevation_m is None:
                return GEEResult(
                    available=False,
                    error="outside_kaduna",
                )

            return GEEResult(
                available=True,
                data={
                    "elevation_m": float(elevation_m),
                    "lat": lat,
                    "lng": lng,
                    "source": "USGS/SRTMGL1_003",
                    "band": "elevation",
                    "source_resolution": "~30 m (1 arc-second SRTM)",
                    "acquisition_year": 2000,
                    "method": "srtm_native_cell_sample",
                    "method_version": "srtm_point_sample_v1",
                    "caution": (
                        "Sampled terrain elevation from satellite-derived SRTM data "
                        "(~30 m source resolution, ~2000 acquisition). "
                        "Not survey-grade ground truth. "
                        "Static topographic data — not a climate variable or forecast."
                    ),
                },
            )

        except Exception as exc:
            return GEEResult(available=False, error=str(exc))

    def compute_flood_occurrence_for_geometry(
        self,
        geometry_dict: dict,
        scale: int = 30,
    ) -> GEEResult:
        """
        Compute JRC Global Surface Water v1.4 flood occurrence statistics for a
        single GeoJSON geometry.

        Product definition
        ------------------
        Dataset : JRC/GSW1_4/GlobalSurfaceWater
        Band    : occurrence  (0–100 %)
        Meaning : percentage of time (1984–2021) that open surface water was
                  detected in each pixel by Landsat.  A static, period-of-record
                  product — not a real-time flood warning or forecast.
        Year    : 2021 (end of JRC GSW v1.4 observation window)
        Season  : annual (the product is not seasonal)

        Output
        ------
        mean          — LGA spatial mean occurrence % (0–100)
        metadata keys:
          area_pct_occurrence_gt_10  — % of LGA pixels where occurrence > 10 %
          area_pct_occurrence_gt_25  — % of LGA pixels where occurrence > 25 %
          area_pct_occurrence_gt_50  — % of LGA pixels where occurrence > 50 %
          method_version             — "jrc_gsw14_occurrence_mean_v1"
          data_caution               — wording note for display consumers

        scale=30 matches the Landsat-derived JRC GSW native 30 m resolution.
        """
        try:
            import ee
        except ImportError:
            return GEEResult(available=False, error="earthengine-api is not installed.")

        try:
            geometry = ee.Geometry(geometry_dict)

            occurrence = (
                ee.Image("JRC/GSW1_4/GlobalSurfaceWater")
                .select("occurrence")
            )

            # Mean occurrence % over the LGA geometry.
            mean_result = occurrence.reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=geometry,
                scale=scale,
                maxPixels=1e9,
            )
            mean_occ = mean_result.getInfo().get("occurrence")

            # Threshold area percentages: fraction of pixels above each threshold.
            # We use a combined reducer to compute the fraction in a single pass.
            def _area_fraction_above(threshold):
                mask = occurrence.gt(threshold)
                frac_result = mask.reduceRegion(
                    reducer=ee.Reducer.mean(),
                    geometry=geometry,
                    scale=scale,
                    maxPixels=1e9,
                )
                frac = frac_result.getInfo().get("occurrence")
                if frac is None:
                    return None
                return round(frac * 100, 4)

            pct_gt_10 = _area_fraction_above(10)
            pct_gt_25 = _area_fraction_above(25)
            pct_gt_50 = _area_fraction_above(50)

            return GEEResult(
                available=True,
                data={
                    "mean": mean_occ,
                    "metadata": {
                        "area_pct_occurrence_gt_10": pct_gt_10,
                        "area_pct_occurrence_gt_25": pct_gt_25,
                        "area_pct_occurrence_gt_50": pct_gt_50,
                        "method_version": "jrc_gsw14_occurrence_mean_v1",
                        "data_caution": (
                            "Historical surface-water occurrence indicator (1984–2021). "
                            "Not a real-time alert — consult official sources for "
                            "current conditions."
                        ),
                    },
                },
            )

        except Exception as exc:
            return GEEResult(available=False, error=str(exc))

    def compute_elevation_for_geometry(
        self,
        geometry_dict: dict,
        scale: int = 30,
    ) -> GEEResult:
        """
        Compute USGS SRTMGL1_003 elevation statistics for a single GeoJSON geometry.

        Product definition
        ------------------
        Dataset : USGS/SRTMGL1_003
        Band    : elevation  (metres above sea level)
        Meaning : NASA SRTM static topographic DEM, ~2000 acquisition.  Not a
                  climate variable — topographic context for exposure analysis.
        Year    : 2000 (SRTM mission date)
        Season  : annual (static, not seasonal)

        Output
        ------
        mean          — LGA spatial mean elevation in metres
        metadata keys:
          min_elevation_m   — minimum pixel elevation (m) within LGA
          max_elevation_m   — maximum pixel elevation (m) within LGA
          mean_elevation_m  — same as mean (convenience alias)
          std_elevation_m   — standard deviation of pixel elevations (m)
          method_version    — "srtm_mean_elevation_v1"
          data_caution      — wording note for display consumers

        scale=30 matches the SRTMGL1_003 native 30 m resolution (~1 arc-second).
        """
        try:
            import ee
        except ImportError:
            return GEEResult(available=False, error="earthengine-api is not installed.")

        try:
            geometry = ee.Geometry(geometry_dict)

            dem = ee.Image("USGS/SRTMGL1_003").select("elevation")

            stats_result = dem.reduceRegion(
                reducer=(
                    ee.Reducer.mean()
                    .combine(ee.Reducer.min(), sharedInputs=True)
                    .combine(ee.Reducer.max(), sharedInputs=True)
                    .combine(ee.Reducer.stdDev(), sharedInputs=True)
                ),
                geometry=geometry,
                scale=scale,
                maxPixels=1e9,
            )
            stats = stats_result.getInfo()

            mean_elev = stats.get("elevation_mean")
            min_elev  = stats.get("elevation_min")
            max_elev  = stats.get("elevation_max")
            std_elev  = stats.get("elevation_stdDev")

            return GEEResult(
                available=True,
                data={
                    "mean": mean_elev,
                    "metadata": {
                        "min_elevation_m":  min_elev,
                        "max_elevation_m":  max_elev,
                        "mean_elevation_m": mean_elev,
                        "std_elevation_m":  std_elev,
                        "method_version":   "srtm_mean_elevation_v1",
                        "data_caution": (
                            "Static topographic layer, not a climate variable. "
                            "SRTM elevation reflects terrain as of ~2000 and does not "
                            "capture subsequent land-surface changes."
                        ),
                    },
                },
            )

        except Exception as exc:
            return GEEResult(available=False, error=str(exc))


    def get_lulc_upstream_template(
        self,
        year: int = 2024,
        display_mode: str = "cartographic",
        start_date: str = "",
        end_date: str = "",
    ) -> "GEEResult":
        """
        Return the GEE tile URL template for the LULC composite, using a
        server-side TTL cache.

        The upstream template (which contains an authenticated GEE map ID) is
        stored in process memory only.  It is never returned to the browser.
        Callers must treat this value as an internal secret.
        """
        if not start_date:
            start_date = f"{year}-09-01"
        if not end_date:
            end_date = f"{year}-11-01"

        cache_key = f"{year}:{display_mode}"
        cached = _lulc_map_cache.get(cache_key)
        if cached and cached["expires"] > time.monotonic():
            return GEEResult(available=True, data={"upstream_template": cached["template"]})

        result = self.get_lulc_tile_url(
            year=year,
            start_date=start_date,
            end_date=end_date,
            display_mode=display_mode,
        )
        if not result.available:
            return result

        template = result.data.get("tile_url", "")
        _lulc_map_cache[cache_key] = {
            "template": template,
            "expires": time.monotonic() + _LULC_CACHE_TTL_S,
        }
        return GEEResult(available=True, data={"upstream_template": template})

    def fetch_lulc_tile_bytes(
        self,
        upstream_template: str,
        z: int,
        x: int,
        y: int,
    ) -> Optional[bytes]:
        """
        Fetch one LULC PNG tile from the GEE upstream using server-side credentials.

        The upstream_template contains the authenticated GEE map ID.  It is
        used to build the specific tile URL internally; it is not logged and
        never appears in any response body.

        Returns raw PNG bytes on success, None on any failure.
        """
        tile_url = (
            upstream_template
            .replace("{z}", str(z))
            .replace("{x}", str(x))
            .replace("{y}", str(y))
        )
        try:
            import ee  # noqa: PLC0415
            from google.auth.transport.requests import AuthorizedSession  # noqa: PLC0415

            # ee.data._credentials was removed in earthengine-api 1.7.x (Cloud API).
            # Credentials now live in ee.data._get_state().credentials.
            state = ee.data._get_state()
            creds = state.credentials
            if creds is None:
                init_result = self.initialize()
                if not init_result.available:
                    return None
                creds = ee.data._get_state().credentials
            session = AuthorizedSession(creds)
            resp = session.get(tile_url, timeout=30)
            if resp.status_code == 200:
                return resp.content
            return None
        except Exception:  # noqa: BLE001
            return None


gee_service = GoogleEarthEngineService()
