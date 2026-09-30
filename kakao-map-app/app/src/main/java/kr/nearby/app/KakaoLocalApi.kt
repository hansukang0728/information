package kr.nearby.app

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

class KakaoApiException(val code: Int, message: String) : Exception(message)

/**
 * 카카오 로컬 API (https://developers.kakao.com/docs/latest/ko/local/dev-guide)
 *
 * 주의: REST API 키가 앱에 들어가므로 앱을 분해하면 키가 보입니다.
 * 정식 출시 전에는 자체 서버를 거쳐 호출하도록 바꾸는 것이 안전합니다.
 */
class KakaoLocalApi(
    private val restApiKey: String,
    private val client: OkHttpClient = OkHttpClient(),
) {

    /** 업종 코드로 주변 검색 (거리순, 최대 45곳) */
    suspend fun searchCategory(code: String, lng: Double, lat: Double, radius: Int): List<Place> =
        fetchAll(
            "category.json",
            mapOf(
                "category_group_code" to code,
                "x" to lng.toString(),
                "y" to lat.toString(),
                "radius" to radius.toString(),
                "sort" to "distance",
            ),
        )

    /** 키워드로 주변 검색 (거리순, 최대 45곳) */
    suspend fun searchKeyword(query: String, lng: Double, lat: Double, radius: Int): List<Place> =
        fetchAll(
            "keyword.json",
            mapOf(
                "query" to query,
                "x" to lng.toString(),
                "y" to lat.toString(),
                "radius" to radius.toString(),
                "sort" to "distance",
            ),
        )

    /** 1~3페이지(15개씩)를 차례로 받아 합칩니다. API가 45개까지만 주기 때문입니다. */
    private suspend fun fetchAll(path: String, params: Map<String, String>): List<Place> =
        withContext(Dispatchers.IO) {
            val places = mutableListOf<Place>()
            for (page in 1..MAX_PAGES) {
                ensureActive()
                val url = "$BASE_URL$path".toHttpUrl().newBuilder().apply {
                    params.forEach { (key, value) -> addQueryParameter(key, value) }
                    addQueryParameter("page", page.toString())
                    addQueryParameter("size", PAGE_SIZE.toString())
                }.build()
                val request = Request.Builder()
                    .url(url)
                    .header("Authorization", "KakaoAK $restApiKey")
                    .build()

                val isEnd = client.newCall(request).execute().use { response ->
                    val body = response.body?.string().orEmpty()
                    if (!response.isSuccessful) {
                        throw KakaoApiException(response.code, errorMessage(body))
                    }
                    val json = JSONObject(body)
                    val documents = json.getJSONArray("documents")
                    for (i in 0 until documents.length()) {
                        places += parsePlace(documents.getJSONObject(i))
                    }
                    json.optJSONObject("meta")?.optBoolean("is_end", true) ?: true
                }
                if (isEnd) break
            }
            places
        }

    private fun parsePlace(doc: JSONObject) = Place(
        id = doc.optString("id"),
        name = doc.optString("place_name"),
        category = doc.optString("category_name"),
        address = doc.optString("road_address_name").ifEmpty { doc.optString("address_name") },
        phone = doc.optString("phone"),
        distance = doc.optString("distance").toIntOrNull(),
        lat = doc.optString("y").toDouble(),
        lng = doc.optString("x").toDouble(),
        url = doc.optString("place_url"),
    )

    private fun errorMessage(body: String): String = try {
        val json = JSONObject(body)
        json.optString("message").ifEmpty { json.optString("msg") }.ifEmpty { body }
    } catch (e: Exception) {
        body
    }

    companion object {
        private const val BASE_URL = "https://dapi.kakao.com/v2/local/search/"
        private const val PAGE_SIZE = 15
        private const val MAX_PAGES = 3
    }
}
