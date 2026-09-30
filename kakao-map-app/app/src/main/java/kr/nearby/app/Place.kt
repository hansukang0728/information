package kr.nearby.app

/** 카카오 로컬 API 검색 결과 한 건 */
data class Place(
    val id: String,
    val name: String,
    /** 예: "음식점 > 카페 > 커피전문점" */
    val category: String,
    val address: String,
    val phone: String,
    /** 검색 중심점으로부터의 거리(m). 없으면 null */
    val distance: Int?,
    val lat: Double,
    val lng: Double,
    /** 카카오맵 장소 상세 페이지 */
    val url: String,
) {
    /** 분류의 마지막 단계만 (예: "커피전문점") */
    val shortCategory: String
        get() = category.substringAfterLast(">").trim()
}

data class Category(val code: String, val name: String)

/** 카카오 로컬 API 카테고리 그룹 코드 */
val CATEGORIES = listOf(
    Category("FD6", "음식점"),
    Category("CE7", "카페"),
    Category("CS2", "편의점"),
    Category("PM9", "약국"),
    Category("HP8", "병원"),
    Category("MT1", "대형마트"),
    Category("BK9", "은행"),
    Category("PK6", "주차장"),
    Category("OL7", "주유소"),
    Category("AD5", "숙박"),
    Category("AT4", "관광명소"),
    Category("CT1", "문화시설"),
    Category("SW8", "지하철역"),
)

sealed interface Query {
    data class ByCategory(val category: Category) : Query
    data class ByKeyword(val text: String) : Query
}

fun formatDistance(meters: Int): String =
    if (meters < 1000) "${meters}m" else String.format("%.1fkm", meters / 1000.0)
