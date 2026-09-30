package kr.nearby.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.location.Location
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.util.Log
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Toast
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.isVisible
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.android.material.chip.Chip
import com.kakao.vectormap.KakaoMap
import com.kakao.vectormap.KakaoMapReadyCallback
import com.kakao.vectormap.LatLng
import com.kakao.vectormap.MapLifeCycleCallback
import com.kakao.vectormap.camera.CameraAnimation
import com.kakao.vectormap.camera.CameraUpdateFactory
import com.kakao.vectormap.label.Label
import com.kakao.vectormap.label.LabelOptions
import com.kakao.vectormap.label.LabelStyle
import com.kakao.vectormap.label.LabelStyles
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kr.nearby.app.databinding.ActivityMainBinding
import org.json.JSONException
import java.io.IOException
import java.security.MessageDigest

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val api by lazy { KakaoLocalApi(BuildConfig.KAKAO_REST_API_KEY) }
    private val adapter = PlaceAdapter(
        onClick = { index -> focusPlace(index, scrollList = false) },
        onCall = ::callPlace,
        onDetail = ::openDetail,
    )

    private var mapStarted = false
    private var kakaoMap: KakaoMap? = null
    private var pinStyles: LabelStyles? = null
    private var selectedPinStyles: LabelStyles? = null
    private var myLocationStyles: LabelStyles? = null
    /** places 와 같은 순서. 인덱스가 곧 장소 번호입니다. */
    private val placeLabels = mutableListOf<Label?>()
    private var myLocationLabel: Label? = null

    private var places: List<Place> = emptyList()
    private var selectedIndex = -1
    private var query: Query = Query.ByCategory(CATEGORIES.first())
    private var myPosition: LatLng = DEFAULT_POSITION
    private var mapCenter: LatLng = DEFAULT_POSITION
    private var lastSearchCenter: LatLng? = null
    private var searchJob: Job? = null
    private var searchAfterPermission = false

    private val locationPermission = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        if (result.values.any { it }) {
            loadMyLocation(searchAfterPermission)
        } else {
            toast("위치 권한이 없어 서울시청 기준으로 검색합니다.")
            if (searchAfterPermission) search(query, myPosition)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        applyWindowInsets()

        // 카카오 개발자 콘솔 > 플랫폼 > Android 에 등록할 키 해시 (Logcat 에서 확인)
        Log.d(TAG, "키 해시: ${keyHashes().joinToString()}")

        if (BuildConfig.KAKAO_NATIVE_APP_KEY.isBlank() || BuildConfig.KAKAO_REST_API_KEY.isBlank()) {
            showMissingKeyDialog()
            return
        }

        setupSearchBar()
        setupCategoryChips()
        binding.listPlaces.layoutManager = LinearLayoutManager(this)
        binding.listPlaces.adapter = adapter
        binding.btnResearch.setOnClickListener { search(query, mapCenter) }
        binding.btnMyLocation.setOnClickListener { requestMyLocation(searchAfter = false) }
        startMap()
    }

    override fun onResume() {
        super.onResume()
        if (mapStarted) binding.mapView.resume()
    }

    override fun onPause() {
        super.onPause()
        if (mapStarted) binding.mapView.pause()
    }

    // ---------- 화면 구성 ----------

    private fun applyWindowInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(binding.root) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime()
            )
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
    }

    private fun setupSearchBar() {
        binding.editKeyword.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                searchKeyword()
                true
            } else {
                false
            }
        }
        binding.btnSearch.setOnClickListener { searchKeyword() }
    }

    private fun setupCategoryChips() {
        CATEGORIES.forEachIndexed { index, category ->
            val chip = layoutInflater.inflate(R.layout.item_category_chip, binding.chipGroup, false) as Chip
            chip.id = View.generateViewId()
            chip.text = category.name
            chip.tag = category
            binding.chipGroup.addView(chip)
            if (index == 0) chip.isChecked = true
        }
        binding.chipGroup.setOnCheckedStateChangeListener { group, checkedIds ->
            // 키워드 검색 때 선택을 해제하면 빈 목록으로 불립니다. 그때는 무시합니다.
            val id = checkedIds.firstOrNull() ?: return@setOnCheckedStateChangeListener
            val category = group.findViewById<Chip>(id).tag as Category
            binding.editKeyword.text.clear()
            search(Query.ByCategory(category), mapCenter)
        }
    }

    // ---------- 지도 ----------

    private fun startMap() {
        binding.mapView.start(object : MapLifeCycleCallback() {
            override fun onMapDestroy() {
                kakaoMap = null
            }

            override fun onMapError(error: Exception) {
                Log.e(TAG, "지도 오류", error)
                showMapErrorDialog(error)
            }
        }, object : KakaoMapReadyCallback() {
            override fun getPosition(): LatLng = myPosition

            override fun getZoomLevel(): Int = DEFAULT_ZOOM

            override fun onMapReady(map: KakaoMap) {
                kakaoMap = map
                setupMap(map)
                requestMyLocation(searchAfter = true)
            }
        })
        mapStarted = true
    }

    private fun setupMap(map: KakaoMap) {
        val labelManager = map.labelManager ?: return
        pinStyles = labelManager.addLabelStyles(
            pinStyles(ContextCompat.getColor(this, R.color.pin), alwaysShowName = false)
        )
        selectedPinStyles = labelManager.addLabelStyles(
            pinStyles(ContextCompat.getColor(this, R.color.pin_selected), alwaysShowName = true)
        )
        myLocationStyles = labelManager.addLabelStyles(
            LabelStyles.from(
                LabelStyle.from(
                    MarkerBitmaps.myLocation(resources, ContextCompat.getColor(this, R.color.my_location))
                ).setAnchorPoint(0.5f, 0.5f)
            )
        )

        map.setOnLabelClickListener { _, _, label ->
            (label.tag as? Int)?.let { index -> focusPlace(index, scrollList = true) }
            true
        }
        map.setOnCameraMoveEndListener { _, position, _ ->
            mapCenter = position.position
            updateResearchButton()
        }
    }

    /** 가게 이름은 많이 확대했을 때만 보여서 마커끼리 글자가 겹치지 않게 합니다. */
    private fun pinStyles(color: Int, alwaysShowName: Boolean): LabelStyles {
        val bitmap = MarkerBitmaps.pin(resources, color)
        val textSize = (12 * resources.displayMetrics.density).toInt()
        val withName = LabelStyle.from(bitmap)
            .setAnchorPoint(0.5f, 1f)
            .setTextStyles(textSize, Color.BLACK, 2, Color.WHITE)
        if (alwaysShowName) return LabelStyles.from(withName)

        val withoutName = LabelStyle.from(bitmap).setAnchorPoint(0.5f, 1f)
        return LabelStyles.from(withoutName, withName.setZoomLevel(NAME_ZOOM))
    }

    private fun showPlacesOnMap() {
        val layer = kakaoMap?.labelManager?.layer
        placeLabels.forEach { label -> label?.let { layer?.remove(it) } }
        placeLabels.clear()

        val styles = pinStyles ?: return
        if (layer == null) return
        places.forEachIndexed { index, place ->
            placeLabels += layer.addLabel(
                LabelOptions.from(LatLng.from(place.lat, place.lng))
                    .setStyles(styles)
                    .setTexts(place.name)
                    .setTag(index)
            )
        }
    }

    private fun focusPlace(index: Int, scrollList: Boolean) {
        val place = places.getOrNull(index) ?: return

        pinStyles?.let { styles -> placeLabels.getOrNull(selectedIndex)?.changeStyles(styles) }
        selectedPinStyles?.let { styles -> placeLabels.getOrNull(index)?.changeStyles(styles) }
        selectedIndex = index

        adapter.setSelected(index)
        if (scrollList) binding.listPlaces.smoothScrollToPosition(index)

        kakaoMap?.moveCamera(
            CameraUpdateFactory.newCenterPosition(LatLng.from(place.lat, place.lng)),
            CameraAnimation.from(300),
        )
    }

    private fun showMyLocation(position: LatLng) {
        myPosition = position
        mapCenter = position
        val map = kakaoMap ?: return
        map.moveCamera(CameraUpdateFactory.newCenterPosition(position, DEFAULT_ZOOM))

        val layer = map.labelManager?.layer ?: return
        myLocationLabel?.let { layer.remove(it) }
        myLocationLabel = myLocationStyles?.let { styles ->
            layer.addLabel(LabelOptions.from(position).setStyles(styles))
        }
    }

    private fun updateResearchButton() {
        val last = lastSearchCenter ?: return
        binding.btnResearch.isVisible = distanceMeters(last, mapCenter) > RESEARCH_THRESHOLD_M
    }

    // ---------- 검색 ----------

    private fun searchKeyword() {
        val text = binding.editKeyword.text.toString().trim()
        if (text.isEmpty()) return
        hideKeyboard()
        binding.chipGroup.clearCheck()
        search(Query.ByKeyword(text), mapCenter)
    }

    private fun search(newQuery: Query, center: LatLng) {
        query = newQuery
        lastSearchCenter = center
        binding.btnResearch.isVisible = false
        binding.progress.isVisible = true
        binding.textStatus.text = "검색 중…"

        searchJob?.cancel()
        searchJob = lifecycleScope.launch {
            try {
                val result = when (newQuery) {
                    is Query.ByCategory -> api.searchCategory(
                        newQuery.category.code, center.longitude, center.latitude, CATEGORY_RADIUS_M
                    )
                    is Query.ByKeyword -> api.searchKeyword(
                        newQuery.text, center.longitude, center.latitude, KEYWORD_RADIUS_M
                    )
                }
                places = result
                selectedIndex = -1
                adapter.submit(result)
                binding.listPlaces.scrollToPosition(0)
                showPlacesOnMap()
                binding.textStatus.text = statusText(newQuery, result.size)
            } catch (e: KakaoApiException) {
                binding.textStatus.text = "검색 실패 (오류 ${e.code})"
                showApiErrorDialog(e)
            } catch (e: IOException) {
                binding.textStatus.text = "네트워크 오류: 인터넷 연결을 확인하세요."
            } catch (e: JSONException) {
                binding.textStatus.text = "응답을 읽지 못했습니다."
            } finally {
                // 새 검색 때문에 취소된 경우에는 새 검색의 로딩 표시를 건드리지 않습니다.
                if (isActive) binding.progress.isVisible = false
            }
        }
    }

    private fun statusText(query: Query, count: Int): String {
        val (label, radius) = when (query) {
            is Query.ByCategory -> query.category.name to CATEGORY_RADIUS_M
            is Query.ByKeyword -> "'${query.text}'" to KEYWORD_RADIUS_M
        }
        val area = "반경 ${formatDistance(radius)}"
        return when {
            count == 0 -> "$label · $area 안에 결과가 없습니다"
            count >= MAX_RESULTS -> "$label · $area · 가까운 ${count}곳 (최대치)"
            else -> "$label · $area · ${count}곳"
        }
    }

    // ---------- 위치 ----------

    private fun requestMyLocation(searchAfter: Boolean) {
        if (hasLocationPermission()) {
            loadMyLocation(searchAfter)
        } else {
            searchAfterPermission = searchAfter
            locationPermission.launch(
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            )
        }
    }

    private fun hasLocationPermission() = listOf(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
    ).any { ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED }

    @SuppressLint("MissingPermission") // hasLocationPermission() 확인 후에만 불립니다.
    private fun loadMyLocation(searchAfter: Boolean) {
        LocationServices.getFusedLocationProviderClient(this)
            .getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, CancellationTokenSource().token)
            .addOnSuccessListener { location ->
                if (location != null) {
                    showMyLocation(LatLng.from(location.latitude, location.longitude))
                } else {
                    toast("현재 위치를 찾지 못했습니다. 위치(GPS)가 켜져 있는지 확인하세요.")
                }
                if (searchAfter) search(query, myPosition)
            }
            .addOnFailureListener {
                toast("현재 위치를 가져오지 못했습니다.")
                if (searchAfter) search(query, myPosition)
            }
    }

    // ---------- 목록 버튼 ----------

    private fun callPlace(place: Place) {
        startSafely(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${place.phone}")))
    }

    private fun openDetail(place: Place) {
        if (place.url.isNotEmpty()) startSafely(Intent(Intent.ACTION_VIEW, Uri.parse(place.url)))
    }

    private fun startSafely(intent: Intent) {
        try {
            startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            toast("열 수 있는 앱이 없습니다.")
        }
    }

    // ---------- 안내 대화상자 ----------

    private fun showMissingKeyDialog() {
        AlertDialog.Builder(this)
            .setTitle("카카오 앱 키가 없습니다")
            .setMessage(
                "프로젝트 폴더의 local.properties 파일에 아래 두 줄을 넣고 다시 빌드하세요.\n\n" +
                    "KAKAO_NATIVE_APP_KEY=네이티브 앱 키\n" +
                    "KAKAO_REST_API_KEY=REST API 키"
            )
            .setPositiveButton("확인", null)
            .show()
    }

    private fun showMapErrorDialog(error: Exception) {
        AlertDialog.Builder(this)
            .setTitle("지도를 불러오지 못했습니다")
            .setMessage(
                "${error.message}\n\n" +
                    "카카오 개발자 콘솔에서 확인하세요.\n" +
                    "1. 네이티브 앱 키가 맞는지\n" +
                    "2. 카카오맵 사용 설정이 ON 인지\n" +
                    "3. Android 플랫폼에 아래 값이 등록돼 있는지\n\n" +
                    "패키지명: $packageName\n" +
                    "키 해시: ${keyHashes().joinToString("\n")}"
            )
            .setPositiveButton("확인", null)
            .show()
    }

    private fun showApiErrorDialog(e: KakaoApiException) {
        val hint = when (e.code) {
            401 -> "REST API 키가 올바른지 확인하세요."
            403 -> "카카오 개발자 콘솔에서 카카오맵 사용 설정이 ON 인지 확인하세요. " +
                "(OPEN_MAP_AND_LOCAL 오류는 이 설정이 꺼져 있다는 뜻입니다)"
            429 -> "오늘 사용할 수 있는 호출 한도를 넘었습니다."
            else -> "잠시 후 다시 시도하세요."
        }
        AlertDialog.Builder(this)
            .setTitle("검색 실패 (오류 ${e.code})")
            .setMessage("${e.message}\n\n$hint")
            .setPositiveButton("확인", null)
            .show()
    }

    // ---------- 도우미 ----------

    /** 이 APK에 서명된 인증서의 키 해시 (카카오 플랫폼 등록용) */
    @Suppress("DEPRECATION")
    private fun keyHashes(): List<String> {
        val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            packageManager.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES)
                .signingInfo?.apkContentsSigners
        } else {
            packageManager.getPackageInfo(packageName, PackageManager.GET_SIGNATURES).signatures
        }
        return signatures.orEmpty().map { signature ->
            val digest = MessageDigest.getInstance("SHA").digest(signature.toByteArray())
            Base64.encodeToString(digest, Base64.NO_WRAP)
        }
    }

    private fun distanceMeters(a: LatLng, b: LatLng): Float {
        val result = FloatArray(1)
        Location.distanceBetween(a.latitude, a.longitude, b.latitude, b.longitude, result)
        return result[0]
    }

    private fun hideKeyboard() {
        val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.hideSoftInputFromWindow(binding.editKeyword.windowToken, 0)
    }

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    companion object {
        private const val TAG = "Nearby"
        /** 위치 권한이 없을 때 기준점: 서울시청 */
        private val DEFAULT_POSITION: LatLng = LatLng.from(37.5666, 126.9784)
        private const val DEFAULT_ZOOM = 15
        /** 이 줌 레벨부터 모든 마커에 가게 이름 표시 */
        private const val NAME_ZOOM = 17
        private const val CATEGORY_RADIUS_M = 1000
        private const val KEYWORD_RADIUS_M = 5000
        private const val MAX_RESULTS = 45
        /** 지도를 이만큼 옮기면 "이 지역에서 다시 검색" 버튼 표시 */
        private const val RESEARCH_THRESHOLD_M = 300f
    }
}
